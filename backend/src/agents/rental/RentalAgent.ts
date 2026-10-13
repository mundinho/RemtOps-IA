import { z } from 'zod';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { BaseAgent, type JudgementRequest, type Outcome } from '../core/BaseAgent.js';
import { fact } from '../core/facts.js';
import { isTerminal } from '../core/policyGuard.js';
import { confidenceField, stringList, upperEnum } from '../core/schemas.js';
import type { Facts, RuleViolation } from '../core/types.js';
import { rentalIntakeRules } from './rules.js';

const IntendedUseJudgement = z.object({
  decision: upperEnum(['PROCEED', 'ESCALATE']),
  confidence: confidenceField,
  reasoning: z.string(),
  safetyFlags: stringList.default([]),
});
type IntendedUseJudgement = z.infer<typeof IntendedUseJudgement>;

/**
 * Rental Agent — INTAKE step.
 * Deterministic: equipment exists, not already booked, dates valid.
 * AI: does the customer's free-text intended use fit this machine? Any safety concern?
 */
export class RentalIntakeAgent extends BaseAgent<IntendedUseJudgement> {
  readonly name = 'RENTAL' as const;
  readonly label = 'Rental Agent';
  readonly goal =
    'Your goal is to validate a new rental request: confirm which equipment was requested, that it is not already booked for the requested dates, and what the customer intends to use it for.';
  protected readonly offeredTools = ['getRentalRequest', 'getEquipment', 'checkEquipmentAvailability'] as const;
  protected readonly requiredFacts = ['getRentalRequest', 'getEquipment', 'checkEquipmentAvailability'] as const;

  protected evaluateRules(facts: Facts) {
    return rentalIntakeRules(facts);
  }

  protected judgementRequest(facts: Facts, violations: RuleViolation[]): JudgementRequest<IntendedUseJudgement> | null {
    const request = fact.request(facts);
    // No AI needed when the request is already rejected, or there is no free text to interpret.
    if (violations.some((v) => isTerminal(v.decision)) || !request.intendedUse?.trim()) return null;

    const equipment = fact.equipment(facts);
    return {
      instructions:
        'Assess whether the intended use written by the customer is compatible with the requested equipment, and whether it raises a safety concern. ' +
        'Choose PROCEED if the use is plausible for this type of machine. Choose ESCALATE if the use looks incompatible with the machine, dangerous, or too unclear to judge.',
      fields:
        '- "decision": "PROCEED" or "ESCALATE"\n' +
        '- "confidence": number between 0 and 1\n' +
        '- "reasoning": one or two sentences\n' +
        '- "safetyFlags": array of short strings (empty if none)',
      schema: IntendedUseJudgement,
      facts: {
        equipment: { name: equipment.name, type: equipment.type },
        intendedUse: request.intendedUse,
        period: `${request.startDate} to ${request.endDate} (${request.days} days)`,
      },
    };
  }

  protected async act(outcome: Outcome<IntendedUseJudgement>, tools: ToolSession) {
    if (outcome.decision === 'ESCALATE') {
      await this.openCase(
        tools,
        outcome,
        'Approve only if the intended use is plausible for this machine and can be done safely; add conditions if needed.',
        outcome.judgement?.safetyFlags.length ? 'HIGH' : 'MEDIUM',
      );
    }
  }

  protected summarize(outcome: Outcome<IntendedUseJudgement>) {
    const request = fact.request(outcome.facts);
    if (outcome.decision === 'PROCEED') {
      return `Request validated — ${request.equipment.name} available ${request.startDate} → ${request.endDate}`;
    }
    return `${outcome.decision === 'ESCALATE' ? 'Flagged' : 'Rejected'}: ${outcome.reasons[0] ?? 'see reasoning'}`;
  }
}
