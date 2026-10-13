import type { AgentDecision } from '@prisma/client';
import { z } from 'zod';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { formatMzn } from '../../utils/money.js';
import { BaseAgent, type JudgementRequest, type Outcome } from '../core/BaseAgent.js';
import { fact, PAYMENT_METHOD_LABELS } from '../core/facts.js';
import { isTerminal } from '../core/policyGuard.js';
import { confidenceField, stringList } from '../core/schemas.js';
import type { Facts, RuleViolation } from '../core/types.js';
import { approvalRules, caseFindings, overridableFlags } from './rules.js';

const ApprovalJudgement = z.object({
  decision: z.preprocess((v) => {
    const s = typeof v === 'string' ? v.trim().toUpperCase() : v;
    return s === 'PROCEED' || s === 'APPROVED' ? 'APPROVE' : s === 'REJECTED' ? 'REJECT' : s;
  }, z.enum(['APPROVE', 'REJECT'])),
  confidence: confidenceField,
  reasoning: z.string(),
  conditions: stringList.default([]),
});
type ApprovalJudgement = z.infer<typeof ApprovalJudgement>;

/**
 * Approval Agent — the autonomous decision-maker (FINALIZE step).
 *
 * No person approves anything. The specialist agents raise FLAGS instead of stopping the flow;
 * this agent reads the whole dossier and decides APPROVE (optionally with conditions that
 * mitigate the flags) or REJECT, with reasoning and confidence.
 *
 * Its mandate is bounded:
 *   - rules decide first: double booking, incomplete checks and non-overridable flags → REJECT
 *   - the AI may only answer APPROVE or REJECT
 *   - not confident enough, invalid answer or model failure → REJECT (never approve in doubt)
 * Every decision, its reasoning and the closed cases stay visible for people to audit.
 */
export class ApprovalAgent extends BaseAgent<ApprovalJudgement> {
  readonly name = 'APPROVAL' as const;
  readonly label = 'Approval Agent';
  readonly goal =
    'Your goal is to take the final decision on a rental request: review what the other agents found (flags, risk, payments) before approving or rejecting.';
  protected readonly offeredTools = [
    'getRentalRequest',
    'getCaseFindings',
    'getCustomer',
    'getCustomerRentalHistory',
    'getCustomerPayments',
  ] as const;
  protected readonly requiredFacts = ['getRentalRequest', 'getCaseFindings', 'checkEquipmentAvailability'] as const;
  protected readonly llmDecisions: readonly AgentDecision[] = ['APPROVE', 'REJECT'];

  protected evaluateRules(facts: Facts) {
    return approvalRules(facts);
  }

  protected judgementRequest(facts: Facts, violations: RuleViolation[]): JudgementRequest<ApprovalJudgement> | null {
    if (violations.some((v) => isTerminal(v.decision))) return null; // policy already decided — no AI needed

    const request = fact.request(facts);
    const flags = overridableFlags(facts);
    return {
      instructions:
        'You are the final approver; no human will review your decision. ' +
        'If there are no flags, APPROVE. If there are flags, decide whether the risk can be mitigated with concrete conditions ' +
        '(for example: present valid insurance before pickup, pay a deposit, pay by M-Pesa or bank transfer instead of cash, shorter rental period). ' +
        'APPROVE with those conditions when the risk is acceptable; REJECT when it is not. ' +
        'Never invent facts. Be conservative: when unsure, REJECT.',
      fields:
        '- "decision": "APPROVE" or "REJECT"\n' +
        '- "confidence": number between 0 and 1\n' +
        '- "reasoning": two or three sentences citing the facts\n' +
        '- "conditions": array of short conditions the customer must meet (empty if none)',
      schema: ApprovalJudgement,
      facts: {
        request: {
          equipment: request.equipment.name,
          period: `${request.startDate} to ${request.endDate} (${request.days} days)`,
          totalAmount: formatMzn(request.totalAmount),
          paymentMethod: request.paymentMethod ? PAYMENT_METHOD_LABELS[request.paymentMethod] : null,
          intendedUse: request.intendedUse,
          riskLevel: request.riskLevel,
        },
        flags: flags.map((f) => ({ raisedBy: f.agent, issue: f.reason })),
        agentConclusions: caseFindings(facts).map((f) => ({ agent: f.agent, conclusion: f.summary })),
        customerHistory: facts.getCustomerRentalHistory ?? 'not requested',
        payments: facts.getCustomerPayments ?? 'not requested',
      },
    };
  }

  /** No human fallback: anything short of a confident approval is a rejection. */
  protected finalDecision(decision: AgentDecision): AgentDecision {
    return decision === 'APPROVE' || decision === 'PROCEED' ? 'APPROVE' : 'REJECT';
  }

  protected async act(outcome: Outcome<ApprovalJudgement>, tools: ToolSession) {
    const judgement = outcome.judgement;
    const flags = overridableFlags(outcome.facts);
    const conditions = outcome.decision === 'APPROVE' ? (judgement?.conditions ?? []) : [];

    if (outcome.decision === 'APPROVE') {
      const reason = flags.length
        ? `Approved by AI with ${conditions.length ? 'conditions' : 'no conditions'} despite ${flags.length} flag(s). ${judgement?.reasoning ?? ''}`
        : `All checks passed — approved by AI. ${judgement?.reasoning ?? ''}`;
      await tools.run('confirmRental', { reason: reason.trim(), conditions });
      await tools.run('resolveCase', { decision: 'APPROVE', notes: [reason, ...conditions.map((c) => `Condition: ${c}`)].join('\n') });
      return {
        summary: `Approved by AI${judgement ? ` (confidence ${Math.round(judgement.confidence * 100)}%)` : ''}${conditions.length ? ` with ${conditions.length} condition(s)` : ''}`,
      };
    }

    // Rejected. The guard already added the AI's reasoning when the AI itself rejected; when the AI
    // was consulted but gave no confident approval, make the fail-safe explicit.
    if (judgement !== undefined && judgement?.decision !== 'REJECT') {
      outcome.reasons.push('No confident AI approval — rejected by default (fail-safe).');
    }
    await tools.run('resolveCase', { decision: 'REJECT', notes: outcome.reasons.join('\n') });
    return { summary: `Rejected: ${outcome.reasons[0]}` };
  }

  protected summarize(outcome: Outcome<ApprovalJudgement>) {
    return outcome.decision === 'APPROVE' ? 'Approved by AI' : `Rejected: ${outcome.reasons[0] ?? 'see reasoning'}`;
  }
}
