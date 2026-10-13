import type { AgentDecision, AgentName, WorkflowStep } from '@prisma/client';

/** What the Orchestrator hands to an agent. */
export interface AgentContext {
  rentalId: string;
  rentalCode: string;
  step: WorkflowStep;
  trigger: string;
}

/** A deterministic business rule that fired. */
export interface RuleViolation {
  rule: string;
  decision: Extract<AgentDecision, 'REJECT' | 'BLOCK' | 'ESCALATE'>;
  reason: string;
}

/** Fields every LLM judgement may carry; each agent extends it with its own. */
export interface BaseJudgement {
  decision?: AgentDecision;
  confidence?: number;
  reasoning?: string;
}

/** Facts gathered through tools, keyed by tool name. */
export type Facts = Record<string, unknown>;

export interface AgentResult {
  executionId: string;
  decision: AgentDecision;
  summary: string;
  reasons: string[];
}
