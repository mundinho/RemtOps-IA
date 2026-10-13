import { BUSINESS_RULES } from '../../config/businessRules.js';
import { fact } from '../core/facts.js';
import type { Facts, RuleViolation } from '../core/types.js';

const todayIso = () => new Date().toLocaleDateString('sv-SE');

/** Deterministic checks on the request itself. No AI involved. */
export function rentalIntakeRules(facts: Facts): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const request = fact.request(facts);
  const equipment = fact.equipment(facts);
  const availability = fact.availability(facts);

  if (equipment.status === 'RETIRED') {
    violations.push({ rule: 'equipment.retired', decision: 'REJECT', reason: 'Equipment has been retired from the fleet.' });
  }

  if (!availability.available) {
    const c = availability.conflicts[0]!;
    violations.push({
      rule: 'equipment.already_rented',
      decision: 'REJECT',
      reason: `Equipment is already rented for the requested period (${c.code}, ${c.start} → ${c.end}).`,
    });
  }

  if (request.startDate < todayIso()) {
    violations.push({ rule: 'period.start_in_past', decision: 'REJECT', reason: 'Requested start date is in the past.' });
  }

  if (request.days > BUSINESS_RULES.maxRentalDays) {
    violations.push({
      rule: 'period.too_long',
      decision: 'REJECT',
      reason: `Requested period of ${request.days} days exceeds the ${BUSINESS_RULES.maxRentalDays}-day maximum.`,
    });
  }

  return violations;
}
