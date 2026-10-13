import type { AgentName } from '@prisma/client';
import type { z } from 'zod';
import { BUSINESS_RULES } from '../../config/businessRules.js';
import { llm, type ChatMessage, type ChatResponse } from '../../llm/index.js';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { isoDay } from '../../utils/dates.js';

/** Accumulates LLM usage for one agent execution (shown in the dashboard). */
export class LlmUsage {
  used = false;
  model: string | null = null;
  inputTokens = 0;
  outputTokens = 0;

  track(response: ChatResponse) {
    this.used = true;
    this.model = response.model;
    this.inputTokens += response.usage.inputTokens;
    this.outputTokens += response.usage.outputTokens;
  }
}

const today = () => isoDay(new Date());
const MAX_TOOL_RESULT_CHARS = 3000;

/**
 * Step 1 of an agent run — the LLM decides which tools to call.
 *
 * The model sees only the read tools offered to it. It may call several at once and loop
 * until it says it has enough (bounded by maxAgentSteps). Every call goes through the
 * ToolSession, so permissions, validation and recording apply.
 */
export async function gatherWithLLM(params: {
  agent: AgentName;
  label: string;
  goal: string;
  rentalCode: string;
  tools: ToolSession;
  offeredTools: readonly string[];
  usage: LlmUsage;
}): Promise<void> {
  const { agent, label, goal, rentalCode, tools, offeredTools, usage } = params;
  const specs = tools.specs(offeredTools);

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        `You are the ${label} of a construction equipment rental company. ${goal}\n` +
        `Today is ${today()}.\n` +
        'Use the available tools to collect the facts you need. You may call several tools at once. ' +
        'Never invent data. When you have collected enough information, answer only: DONE.',
    },
    { role: 'user', content: `New task for rental request ${rentalCode}. Collect the information you need.` },
  ];

  for (let step = 0; step < BUSINESS_RULES.maxAgentSteps; step++) {
    const response = await llm.chat({ messages, tools: specs, agent });
    usage.track(response);
    if (!response.toolCalls.length) return;

    messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
    for (const call of response.toolCalls) {
      const outcome = call.parseError
        ? ({ ok: false, error: call.parseError } as const)
        : await tools.call(call.name, call.arguments, 'LLM', offeredTools);
      const content = JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error });
      messages.push({ role: 'tool', toolCallId: call.id, name: call.name, content: content.slice(0, MAX_TOOL_RESULT_CHARS) });
    }
  }
}

/**
 * Step 4 of an agent run — the LLM gives a structured judgement over the gathered facts.
 * The answer must be JSON matching the agent's schema; one retry on invalid output, then null
 * (which the Policy Guard turns into an escalation).
 */
export async function judgeWithLLM<T>(params: {
  agent: AgentName;
  label: string;
  instructions: string;
  fields: string;
  facts: unknown;
  schema: z.ZodType<T>;
  usage: LlmUsage;
}): Promise<T | null> {
  const { agent, label, instructions, fields, facts, schema, usage } = params;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content:
        `You are the ${label} of a construction equipment rental company. Today is ${today()}.\n` +
        `${instructions}\n` +
        'Base your answer ONLY on the facts provided. Never invent data.\n' +
        `Answer with a single JSON object with these fields:\n${fields}`,
    },
    { role: 'user', content: `Facts:\n${JSON.stringify(facts, null, 1)}` },
  ];

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await llm.chat({ messages, agent, responseFormat: 'json' });
    usage.track(response);

    const parsed = safeJson(response.content);
    const result = parsed === undefined ? null : schema.safeParse(parsed);
    if (result?.success) return result.data;

    messages.push(
      { role: 'assistant', content: response.content ?? '' },
      {
        role: 'user',
        content: `That answer was not valid (${result ? result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') : 'not JSON'}). Reply with only the JSON object.`,
      },
    );
  }
  return null;
}

function safeJson(text: string | null): unknown {
  if (!text) return undefined;
  try {
    // Some models wrap JSON in ```json fences
    return JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ''));
  } catch {
    return undefined;
  }
}
