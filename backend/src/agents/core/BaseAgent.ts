import type { AgentDecision, AgentName, Prisma } from '@prisma/client';
import type { z } from 'zod';
import { finishExecution, startExecution } from '../../services/agentExecution.service.js';
import type { ToolName } from '../../tools/registry.js';
import { ToolSession } from '../../tools/toolExecutor.js';
import { gatherWithLLM, judgeWithLLM, LlmUsage } from './llmSteps.js';
import { applyPolicyGuard, type GuardResult } from './policyGuard.js';
import type { AgentContext, AgentResult, BaseJudgement, Facts, RuleViolation } from './types.js';

export interface JudgementRequest<J> {
  instructions: string;
  /** Field list shown to the model (kept short and explicit for small local models). */
  fields: string;
  schema: z.ZodType<J>;
  /** Which facts to show; defaults to everything gathered. */
  facts?: Facts;
}

export interface Outcome<J> extends GuardResult {
  judgement: J | null | undefined;
  facts: Facts;
}

/**
 * The run loop shared by every agent (Template Method):
 *
 *   1. GATHER   — the LLM chooses which read tools to call                (AI)
 *   2. ENSURE   — any evidence the rules require but the LLM skipped is
 *                 fetched anyway, marked source=POLICY                     (deterministic)
 *   3. RULES    — hard business rules over the facts                      (deterministic)
 *   4. JUDGE    — the LLM returns a structured assessment                 (AI, optional)
 *   5. GUARD    — the most restrictive of rules vs. AI wins               (deterministic)
 *   6. ACT      — side effects through write tools, audited               (deterministic)
 *
 * Every step is recorded in AgentExecution / AgentToolCall, so the dashboard can show
 * exactly what the agent saw, which tools it used, what it decided and why.
 */
export abstract class BaseAgent<J extends BaseJudgement = BaseJudgement> {
  abstract readonly name: AgentName;
  abstract readonly label: string;
  /** The agent's objective, given to the LLM. */
  abstract readonly goal: string;
  /** Read tools offered to the LLM in the GATHER step. Empty = no LLM tool selection. */
  protected readonly offeredTools: readonly ToolName[] = [];
  /** Evidence the decision cannot be taken without. */
  protected abstract readonly requiredFacts: readonly ToolName[];
  /** Decisions the LLM may take on its own (anything else is escalated). */
  protected readonly llmDecisions: readonly AgentDecision[] = ['PROCEED', 'ESCALATE'];
  protected readonly escalateOnMissingJudgement: boolean = true;

  protected abstract evaluateRules(facts: Facts, judgement?: J | null): RuleViolation[];

  /** Return null when no AI judgement is needed for these facts. */
  protected abstract judgementRequest(facts: Facts, violations: RuleViolation[]): JudgementRequest<J> | null;

  /** May return a summary built from what the action produced (agents are shared — keep no per-run state on `this`). */
  protected abstract act(outcome: Outcome<J>, tools: ToolSession, ctx: AgentContext): Promise<void | { summary?: string }>;

  protected abstract summarize(outcome: Outcome<J>): string;

  /** Hook to rename the final decision (e.g. PROCEED → APPROVE when finalising). */
  protected finalDecision(decision: AgentDecision): AgentDecision {
    return decision;
  }

  async run(ctx: AgentContext): Promise<AgentResult> {
    const execution = await startExecution({
      agent: this.name,
      correlationId: ctx.rentalId,
      rentalId: ctx.rentalId,
      step: ctx.step,
      trigger: ctx.trigger,
      input: { rental: ctx.rentalCode, step: ctx.step, trigger: ctx.trigger },
    });
    const tools = new ToolSession(this.name, execution.id, { rentalId: ctx.rentalId });
    const usage = new LlmUsage();
    const notes: string[] = [];

    try {
      // 1. GATHER — the model picks tools
      if (this.offeredTools.length) {
        try {
          await gatherWithLLM({
            agent: this.name,
            label: this.label,
            goal: this.goal,
            rentalCode: ctx.rentalCode,
            tools,
            offeredTools: this.offeredTools,
            usage,
          });
        } catch (e) {
          notes.push(`LLM tool selection failed (${(e as Error).message}); required evidence fetched by policy.`);
        }
      }

      // 2. ENSURE — required evidence, regardless of what the model chose
      for (const tool of this.requiredFacts) {
        if (!(tool in tools.facts)) await tools.run(tool, {}, 'POLICY');
      }

      // 3. RULES (pre-judgement, to decide whether the AI is needed at all)
      const preViolations = this.evaluateRules(tools.facts);

      // 4. JUDGE
      let judgement: J | null | undefined;
      const request = this.judgementRequest(tools.facts, preViolations);
      if (request) {
        try {
          judgement = await judgeWithLLM({
            agent: this.name,
            label: this.label,
            instructions: request.instructions,
            fields: request.fields,
            facts: request.facts ?? tools.facts,
            schema: request.schema,
            usage,
          });
        } catch (e) {
          notes.push(`LLM judgement failed: ${(e as Error).message}`);
          judgement = null;
        }
      }

      // 3b. RULES again — some rules use AI-derived facts (e.g. an issue's classified severity)
      const violations = request ? this.evaluateRules(tools.facts, judgement) : preViolations;

      // 5. GUARD
      const guard = applyPolicyGuard({
        violations,
        judgement,
        llmDecisions: this.llmDecisions,
        escalateOnMissingJudgement: this.escalateOnMissingJudgement,
      });
      const outcome: Outcome<J> = {
        ...guard,
        decision: this.finalDecision(guard.decision),
        judgement,
        facts: tools.facts,
      };

      // 6. ACT
      const acted = await this.act(outcome, tools, ctx);

      const summary = acted?.summary ?? this.summarize(outcome);
      await finishExecution(execution.id, execution.startedAt, {
        status: 'SUCCEEDED',
        decision: outcome.decision,
        summary,
        reasoning: [judgement?.reasoning, ...outcome.reasons, ...notes].filter(Boolean).join('\n'),
        confidence: judgement?.confidence ?? null,
        output: toJson({ violations, judgement: judgement ?? null, reasons: outcome.reasons, decision: outcome.decision }),
        usedLLM: usage.used,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        policyOverride: outcome.policyOverride,
      });
      return { executionId: execution.id, decision: outcome.decision, summary, reasons: outcome.reasons };
    } catch (e) {
      // Fail-safe: an agent that crashes never lets a request through — it raises a flag, and the
      // Approval Agent rejects any request whose checks could not all be completed.
      const error = e instanceof Error ? e.message : String(e);
      const decision: AgentDecision = this.name === 'NOTIFICATION' ? 'NONE' : 'ESCALATE';
      const summary = `Agent failed: ${error}`;
      if (decision === 'ESCALATE') await this.escalateAfterFailure(tools, error);
      await finishExecution(execution.id, execution.startedAt, {
        status: 'FAILED',
        decision,
        summary,
        error,
        usedLLM: usage.used,
        model: usage.model,
      });
      return { executionId: execution.id, decision, summary, reasons: [summary] };
    }
  }

  /** Shared helper for agents that raise a flag: one case, with the facts the agent saw, for the Approval Agent. */
  protected async openCase(
    tools: ToolSession,
    outcome: Outcome<J>,
    recommendedAction: string,
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' = 'MEDIUM',
  ) {
    await tools.run('openCase', {
      reason: outcome.reasons.join(' ') || 'Agent could not decide within policy.',
      recommendedAction,
      priority,
      analyzedData: outcome.facts,
    });
  }

  private async escalateAfterFailure(tools: ToolSession, error: string) {
    try {
      await tools.run('openCase', {
        reason: `The ${this.label} could not complete its checks: ${error}`,
        recommendedAction: 'Do not approve until the check can be completed.',
        priority: 'HIGH',
        analyzedData: tools.facts,
      });
    } catch {
      // Agents without openCase (e.g. Approval) — the failed execution itself is the record.
    }
  }
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
