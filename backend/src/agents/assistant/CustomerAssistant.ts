import { BUSINESS_RULES } from '../../config/businessRules.js';
import { llm, type ChatMessage } from '../../llm/index.js';
import { finishExecution, startExecution } from '../../services/agentExecution.service.js';
import { ToolSession } from '../../tools/toolExecutor.js';
import { isoDay } from '../../utils/dates.js';
import { neutraliseAccusations } from '../core/languageGuard.js';
import { LlmUsage } from '../core/llmSteps.js';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const TOOLS = ['getMachineInfo', 'checkDatesAvailability', 'getRentalPolicy', 'getMyRequestStatus'] as const;
const MAX_TOOL_ROUNDS = 4;
const MAX_HISTORY = 12;
const FALLBACK = 'Sorry, I could not answer that right now. You can still submit your request with the form — every request gets an automatic decision.';

/**
 * Customer Assistant — the chatbot on the QR pages.
 *
 * Still an agent, not a free chat: the model answers ONLY from what its tools return, its tools are
 * read-only and public-safe, and the machine (and the customer's own request, on the status page)
 * are fixed by the server. It cannot approve, change or cancel anything — it explains and informs.
 * Every conversation turn is recorded as an AgentExecution, like any other agent run.
 */
export async function answerCustomer(input: {
  equipmentCode: string;
  rentalId?: string;
  history: ChatTurn[];
}): Promise<{ reply: string; toolsUsed: string[] }> {
  const question = input.history.at(-1)?.content ?? '';
  const execution = await startExecution({
    agent: 'ASSISTANT',
    correlationId: input.rentalId ?? `CHAT-${input.equipmentCode}`,
    rentalId: input.rentalId,
    trigger: 'customer.chat',
    input: { equipment: input.equipmentCode, question },
  });
  const tools = new ToolSession(
    'ASSISTANT',
    execution.id,
    input.rentalId ? { rentalId: input.rentalId, equipmentCode: input.equipmentCode } : { correlationId: execution.id, equipmentCode: input.equipmentCode },
  );
  const usage = new LlmUsage();
  const toolsUsed: string[] = [];
  let reply: string | null = null;
  let error: string | undefined;

  try {
    // ENSURE: the facts every answer may need are loaded by code, not left to the model's choice.
    // (A small model left alone answered "which documents?" from imagination.)
    const mentioned = periodMentionedIn(question);
    const knownFacts = {
      machine: await tools.run('getMachineInfo', {}, 'POLICY'),
      rentalPolicy: await tools.run('getRentalPolicy', {}, 'POLICY'),
      ...(input.rentalId && { myRequest: await tools.run('getMyRequestStatus', {}, 'POLICY') }),
      // A period named in the question is checked up front, so the answer never depends on the model doing date maths.
      ...(mentioned && {
        availabilityForMentionedPeriod: await tools.run('checkDatesAvailability', { startDate: mentioned.from, endDate: mentioned.to }, 'POLICY'),
      }),
    };

    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          `You are the customer assistant of RentOps, a construction equipment rental company in Mozambique. Today is ${isoDay(new Date())}. ` +
          `The customer scanned the QR code of machine ${input.equipmentCode}.\n` +
          `CALENDAR (use these exact dates for relative expressions): ${JSON.stringify(referenceDates())}\n` +
          `VERIFIED FACTS (the only source for machine details, documents, payment and request status):\n${JSON.stringify(knownFacts)}\n` +
          'Rules: answer ONLY from the verified facts or from tool results — if something is not there, say you do not have that information. ' +
          'For availability or price, call checkDatesAvailability. If the customer gives a relative period ("next week", "5 days from Monday"), ' +
          'convert it to YYYY-MM-DD dates yourself (a week = Monday to Sunday) and check, stating the dates you used. Prices are in MZN. ' +
          'Never mention tools, functions or internal systems to the customer. ' +
          'You cannot approve, change or cancel requests: requests are submitted with the form on this page and decided automatically. ' +
          'You never share information about other customers or previous renters — say this is confidential. Politely decline unrelated topics. ' +
          "Reply in the customer's language (Portuguese or English), in at most 4 short sentences." +
          (mentioned
            ? `\nThe customer's question refers to ${mentioned.from} → ${mentioned.to}. Its availability and price are already in VERIFIED FACTS ` +
              '(availabilityForMentionedPeriod): answer directly with them and state those dates. Do not ask for dates.'
            : ''),
      },
      ...input.history.slice(-MAX_HISTORY).map((t) => ({ role: t.role, content: t.content }) as ChatMessage),
    ];

    // The model only chooses tools for what depends on the question (dates).
    const specs = tools.specs(['checkDatesAvailability']);
    for (let round = 0; round <= MAX_TOOL_ROUNDS; round++) {
      const response = await llm.chat({ messages, tools: round < MAX_TOOL_ROUNDS ? specs : undefined, agent: 'ASSISTANT' });
      usage.track(response);
      if (!response.toolCalls.length) {
        reply = response.content?.trim() || null;
        break;
      }
      messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
      for (const call of response.toolCalls) {
        toolsUsed.push(call.name);
        const outcome = call.parseError
          ? ({ ok: false, error: call.parseError } as const)
          : await tools.call(call.name, call.arguments, 'LLM', TOOLS);
        messages.push({
          role: 'tool',
          toolCallId: call.id,
          name: call.name,
          content: JSON.stringify(outcome.ok ? outcome.result : { error: outcome.error }).slice(0, 3000),
        });
      }
    }
  } catch (e) {
    error = e instanceof Error ? e.message : String(e);
  }

  const answer = neutraliseAccusations(reply ?? FALLBACK).text;
  await finishExecution(execution.id, execution.startedAt, {
    status: error ? 'FAILED' : 'SUCCEEDED',
    decision: 'NONE',
    summary: `Answered: “${question.slice(0, 80)}${question.length > 80 ? '…' : ''}”`,
    reasoning: answer,
    usedLLM: usage.used,
    model: usage.model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    error,
  });
  return { reply: answer, toolsUsed: [...new Set(toolsUsed)] };
}

/**
 * Date arithmetic is deterministic — done here, not by the model (a 3B model could not turn
 * "next week" into dates on its own). The model only picks the matching range.
 */
function referenceDates() {
  const today = new Date();
  const day = (offset: number) => isoDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset))!;
  const daysToNextMonday = ((8 - today.getDay()) % 7) || 7;
  const daysToSaturday = (6 - today.getDay() + 7) % 7;
  return {
    today: day(0),
    tomorrow: day(1),
    thisWeekend: { from: day(daysToSaturday), to: day(daysToSaturday + 1) },
    nextWeek: { from: day(daysToNextMonday), to: day(daysToNextMonday + 6) },
    weekAfterNext: { from: day(daysToNextMonday + 7), to: day(daysToNextMonday + 13) },
    nextMonth: {
      from: isoDay(new Date(today.getFullYear(), today.getMonth() + 1, 1))!,
      to: isoDay(new Date(today.getFullYear(), today.getMonth() + 2, 0))!,
    },
  };
}

/** Finds a period in the customer's words: explicit dates (2026-10-12, 12/10/2026) or common PT/EN expressions. */
export function periodMentionedIn(text: string): { from: string; to: string } | null {
  const lower = text.toLowerCase();
  const explicit = [...text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b|\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)].map((m) =>
    m[1] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[6]}-${m[5]!.padStart(2, '0')}-${m[4]!.padStart(2, '0')}`,
  );
  if (explicit.length) return { from: explicit[0]!, to: explicit[1] ?? explicit[0]! };

  const ref = referenceDates();
  const patterns: [RegExp, { from: string; to: string }][] = [
    [/pr[oó]xima semana|semana que vem|next week/, ref.nextWeek],
    [/daqui a duas semanas|week after next/, ref.weekAfterNext],
    [/fim[- ]de[- ]semana|weekend/, ref.thisWeekend],
    [/pr[oó]ximo m[eê]s|m[eê]s que vem|next month/, ref.nextMonth],
    [/amanh[aã]|tomorrow/, { from: ref.tomorrow, to: ref.tomorrow }],
  ];
  return patterns.find(([re]) => re.test(lower))?.[1] ?? null;
}

export const ASSISTANT_LIMITS = { maxHistory: MAX_HISTORY, maxMessageLength: 600, maxRentalDays: BUSINESS_RULES.maxRentalDays };
