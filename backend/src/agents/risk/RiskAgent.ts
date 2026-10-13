import { z } from 'zod';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { BaseAgent, type JudgementRequest, type Outcome } from '../core/BaseAgent.js';
import { fact } from '../core/facts.js';
import { isTerminal } from '../core/policyGuard.js';
import { confidenceField, stringList, upperEnum } from '../core/schemas.js';
import type { Facts, RuleViolation } from '../core/types.js';
import { riskRules } from './rules.js';

const RiskJudgement = z.object({
  decision: upperEnum(['PROCEED', 'ESCALATE', 'REJECT']),
  confidence: confidenceField,
  reasoning: z.string(),
  riskLevel: upperEnum(['LOW', 'MEDIUM', 'HIGH']),
  riskScore: z.coerce.number().int().min(0).max(100),
  evidence: stringList.default([]),
  recommendedAction: z.string().optional(),
});
type RiskJudgement = z.infer<typeof RiskJudgement>;

/**
 * Risk & Compliance Agent.
 * Deterministic: blocked account, documents, late/damage thresholds, value limit, identity check.
 * AI: weighs all signals together into a risk level/score with cited evidence, and suggests what
 * would make a flagged rental acceptable — input for the Approval Agent's final decision.
 *
 * This agent's AI may PROCEED or ESCALATE (flag). It does not reject on its own: the final
 * decision belongs to the Approval Agent, within its policy mandate.
 */
export class RiskAgent extends BaseAgent<RiskJudgement> {
  readonly name = 'RISK' as const;
  readonly label = 'Risk & Compliance Agent';
  readonly goal =
    'Your goal is to assess the risk of this rental: the customer account, their documents, their rental history (late returns, damage) and the rental value.';
  protected readonly offeredTools = ['getRentalRequest', 'getCustomer', 'getCustomerRentalHistory', 'checkDocuments'] as const;
  protected readonly requiredFacts = ['getRentalRequest', 'getCustomer', 'getCustomerRentalHistory', 'checkDocuments'] as const;

  protected evaluateRules(facts: Facts) {
    return riskRules(facts);
  }

  protected judgementRequest(facts: Facts, violations: RuleViolation[]): JudgementRequest<RiskJudgement> | null {
    if (violations.some((v) => isTerminal(v.decision))) return null; // blocked account: nothing to weigh

    const request = fact.request(facts);
    const customer = fact.customer(facts);
    const history = fact.history(facts);
    return {
      instructions:
        'Assess the risk of renting this equipment to this customer. Weigh the documents, the rental history (late returns, damage) and the rental value. ' +
        'Choose PROCEED if the risk is acceptable, ESCALATE to flag it for the final approval decision. ' +
        'In "evidence", list the specific facts you relied on. In "recommendedAction", say what would make the rental acceptable (e.g. a deposit).',
      fields:
        '- "decision": "PROCEED" or "ESCALATE"\n' +
        '- "confidence": number between 0 and 1\n' +
        '- "riskLevel": "LOW", "MEDIUM" or "HIGH"\n' +
        '- "riskScore": integer 0-100 (higher = riskier)\n' +
        '- "reasoning": one or two sentences\n' +
        '- "evidence": array of short strings quoting facts\n' +
        '- "recommendedAction": string',
      schema: RiskJudgement,
      facts: {
        customer: { company: customer.companyName, blocked: customer.isBlocked, creditLimit: customer.creditLimit, notes: customer.notes },
        documents: fact.documents(facts),
        history: {
          totalRentals: history.totalRentals,
          lateReturns: history.lateReturns,
          totalLateDays: history.totalLateDays,
          damageIncidents: history.damageIncidents,
        },
        rental: { equipment: request.equipment.name, days: request.days, totalAmount: request.totalAmount },
        policyFindings: violations.map((v) => v.reason),
      },
    };
  }

  protected async act(outcome: Outcome<RiskJudgement>, tools: ToolSession) {
    const judgement = outcome.judgement;
    if (judgement) {
      await tools.run('recordRiskAssessment', { riskLevel: judgement.riskLevel, riskScore: judgement.riskScore });
    }
    if (outcome.decision === 'ESCALATE') {
      await this.openCase(
        tools,
        outcome,
        judgement?.recommendedAction?.trim() ||
          'Verify the customer documentation and payment history, then approve with conditions or reject.',
        outcome.reasons.length > 1 ? 'HIGH' : 'MEDIUM',
      );
    }
  }

  protected summarize(outcome: Outcome<RiskJudgement>) {
    const level = outcome.judgement ? ` — risk ${outcome.judgement.riskLevel.toLowerCase()} (${outcome.judgement.riskScore}/100)` : '';
    if (outcome.decision === 'PROCEED') return `Customer risk assessment completed${level}`;
    return `${outcome.decision === 'ESCALATE' ? 'Escalated' : 'Rejected'}: ${outcome.reasons[0] ?? 'see reasoning'}${level}`;
  }
}
