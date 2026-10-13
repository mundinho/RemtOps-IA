import type { AgentDecision } from '@prisma/client';
import { BUSINESS_RULES } from '../../config/businessRules.js';
import type { BaseJudgement, RuleViolation } from './types.js';

/** How restrictive a decision is. The guard always keeps the most restrictive one. */
const RESTRICTIVENESS: Record<AgentDecision, number> = {
  NONE: 0,
  PROCEED: 0,
  APPROVE: 0,
  ESCALATE: 1,
  REJECT: 2,
  BLOCK: 2,
};

const PERMISSIVE: AgentDecision[] = ['PROCEED', 'APPROVE'];

export function mostRestrictive(decisions: AgentDecision[]): AgentDecision {
  return decisions.reduce<AgentDecision>((a, b) => (RESTRICTIVENESS[b] > RESTRICTIVENESS[a] ? b : a), 'PROCEED');
}

export const isTerminal = (d: AgentDecision) => RESTRICTIVENESS[d] === 2;

export interface GuardInput {
  violations: RuleViolation[];
  /** undefined = the LLM was not consulted. null = consulted but produced nothing usable. */
  judgement: BaseJudgement | null | undefined;
  /** The decisions this agent's LLM is allowed to make on its own. */
  llmDecisions: readonly AgentDecision[];
  /** If false, a missing judgement does not force a flag (e.g. message drafting). */
  escalateOnMissingJudgement: boolean;
}

export interface GuardResult {
  decision: AgentDecision;
  reasons: string[];
  /** True when the deterministic rules contradicted a more permissive LLM decision. */
  policyOverride: boolean;
}

/**
 * The Policy Guard — the core safety property of the system:
 *
 *   The AI can make a decision MORE restrictive, never LESS.
 *
 *   - Hard rules (REJECT/BLOCK/ESCALATE) always win over the LLM.
 *   - The LLM may only return decisions in its allowlist; anything else is not accepted.
 *   - Low confidence, invalid output or no answer never let a request through (fail-safe).
 */
export function applyPolicyGuard({ violations, judgement, llmDecisions, escalateOnMissingJudgement }: GuardInput): GuardResult {
  const reasons = violations.map((v) => v.reason);
  const ruleDecision = mostRestrictive(violations.map((v) => v.decision));

  if (judgement === undefined) return { decision: ruleDecision, reasons, policyOverride: false };

  if (judgement === null) {
    if (!escalateOnMissingJudgement) return { decision: ruleDecision, reasons, policyOverride: false };
    return {
      decision: mostRestrictive([ruleDecision, 'ESCALATE']),
      reasons: [...reasons, 'No valid AI assessment (invalid or missing answer from the model).'],
      policyOverride: false,
    };
  }

  let aiDecision: AgentDecision = judgement.decision ?? 'PROCEED';
  if (!llmDecisions.includes(aiDecision)) {
    reasons.push(`AI proposed ${aiDecision}, which it is not permitted to decide — not accepted.`);
    aiDecision = 'ESCALATE';
  }
  const confidence = judgement.confidence ?? 0;
  if (PERMISSIVE.includes(aiDecision) && judgement.decision && confidence < BUSINESS_RULES.minLlmConfidence) {
    reasons.push(
      `AI confidence ${Math.round(confidence * 100)}% is below the ${BUSINESS_RULES.minLlmConfidence * 100}% threshold — not accepted.`,
    );
    aiDecision = 'ESCALATE';
  }
  // When the AI itself raised a concern, its explanation becomes part of the reasons.
  if (judgement.decision && !PERMISSIVE.includes(judgement.decision) && judgement.reasoning) {
    reasons.push(`AI: ${judgement.reasoning}`);
  }

  return {
    // Keep the AI's own decision unless the rules are stricter (so APPROVE is not flattened to PROCEED)
    decision: RESTRICTIVENESS[aiDecision] >= RESTRICTIVENESS[ruleDecision] ? aiDecision : ruleDecision,
    reasons,
    policyOverride: judgement.decision != null && RESTRICTIVENESS[ruleDecision] > RESTRICTIVENESS[judgement.decision],
  };
}
