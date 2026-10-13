import type { AgentDecision, WorkflowStep } from '@prisma/client';

/**
 * The rental workflow as an explicit state machine — fully autonomous, no human step.
 *
 * WHY deterministic and not an LLM? The ORDER of the process is a business rule, not a judgement:
 * "check maintenance before risk", "a blocked machine ends the flow". Putting it in a table makes it
 * predictable, testable and auditable — and changing the process means editing this table, not
 * the agents. The AI lives inside the steps, where there is ambiguity to resolve.
 *
 * ESCALATE no longer stops the flow: it is a FLAG. Every check still runs, and the Approval Agent
 * weighs all flags together at FINALIZE. REJECT/BLOCK end the flow immediately.
 */

export type AgentStep = Extract<
  WorkflowStep,
  'INTAKE' | 'MAINTENANCE_CHECK' | 'RISK_ASSESSMENT' | 'FINANCE_CHECK' | 'FINALIZE' | 'BILLING' | 'NOTIFY'
>;

export const TRANSITIONS: Record<AgentStep, Partial<Record<AgentDecision, WorkflowStep>>> = {
  INTAKE:            { PROCEED: 'MAINTENANCE_CHECK', ESCALATE: 'MAINTENANCE_CHECK', REJECT: 'NOTIFY' },
  MAINTENANCE_CHECK: { PROCEED: 'RISK_ASSESSMENT',   ESCALATE: 'RISK_ASSESSMENT',   BLOCK: 'NOTIFY' },
  RISK_ASSESSMENT:   { PROCEED: 'FINANCE_CHECK',     ESCALATE: 'FINANCE_CHECK',     REJECT: 'NOTIFY' },
  FINANCE_CHECK:     { PROCEED: 'FINALIZE',          ESCALATE: 'FINALIZE' },
  FINALIZE:          { APPROVE: 'BILLING',           REJECT: 'NOTIFY' },   // Approval Agent (AI) decides
  BILLING:           { PROCEED: 'NOTIFY',            ESCALATE: 'NOTIFY' },
  NOTIFY:            { NONE: 'DONE' },
};

export const isAgentStep = (step: WorkflowStep): step is AgentStep => step in TRANSITIONS;
