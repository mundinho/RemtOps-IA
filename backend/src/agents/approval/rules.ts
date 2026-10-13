import { BUSINESS_RULES } from '../../config/businessRules.js';
import { fact } from '../core/facts.js';
import type { Facts, RuleViolation } from '../core/types.js';

export interface CaseFinding {
  agent: string;
  status: 'RUNNING' | 'SUCCEEDED' | 'FAILED';
  decision: string | null;
  summary: string | null;
  flags: RuleViolation[];
  aiAssessment: string | null;
  aiConfidence: number | null;
}

export const caseFindings = (facts: Facts) => (facts.getCaseFindings ?? []) as CaseFinding[];

/** Flags the AI is allowed to weigh (everything except the non-overridable ones). */
export function overridableFlags(facts: Facts): (RuleViolation & { agent: string })[] {
  const locked: readonly string[] = BUSINESS_RULES.autonomy.nonOverridableRules;
  return caseFindings(facts).flatMap((f) => f.flags.filter((v) => !locked.includes(v.rule)).map((v) => ({ ...v, agent: f.agent })));
}

/**
 * What the Approval Agent may NOT decide — evaluated before the AI is asked:
 *   - the equipment was booked by someone else while this request was processed
 *   - a check could not be completed (an agent failed)
 *   - a flag the policy marks as non-overridable (identity, debt, credit, serious defects)
 * With no human in the loop, each of these means: rejected.
 */
export function approvalRules(facts: Facts): RuleViolation[] {
  const violations: RuleViolation[] = [];

  const availability = fact.availability(facts);
  if (!availability.available) {
    const c = availability.conflicts[0]!;
    violations.push({
      rule: 'equipment.booked_meanwhile',
      decision: 'REJECT',
      reason: `Equipment was booked by ${c.code} for an overlapping period while this request was being processed.`,
    });
  }

  for (const finding of caseFindings(facts)) {
    if (finding.status === 'FAILED') {
      violations.push({
        rule: 'checks.incomplete',
        decision: 'REJECT',
        reason: `The ${finding.agent.toLowerCase()} check could not be completed — automatic approval is not possible.`,
      });
    }
    for (const flag of finding.flags) {
      if ((BUSINESS_RULES.autonomy.nonOverridableRules as readonly string[]).includes(flag.rule)) {
        violations.push({ rule: `locked:${flag.rule}`, decision: 'REJECT', reason: flag.reason });
      }
    }
  }
  return violations;
}
