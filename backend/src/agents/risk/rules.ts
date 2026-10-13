import { BUSINESS_RULES } from '../../config/businessRules.js';
import { formatMzn } from '../../utils/money.js';
import { fact, humanizeDoc } from '../core/facts.js';
import type { Facts, RuleViolation } from '../core/types.js';

/** Company policy on customers. Thresholds live in config/businessRules.ts. */
export function riskRules(facts: Facts): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const customer = fact.customer(facts);
  const history = fact.history(facts);
  const documents = fact.documents(facts);
  const request = fact.request(facts);

  if (customer.isBlocked) {
    violations.push({
      rule: 'customer.blocked',
      decision: 'REJECT',
      reason: `Customer account is blocked${customer.notes ? `: ${customer.notes}` : '.'}`,
    });
  }

  if (!documents.complete) {
    const problems = [
      ...documents.expired.map((d) => `${humanizeDoc(d.type)} expired on ${d.expiredOn}`),
      ...documents.missing.map((t) => `${humanizeDoc(t)} missing`),
    ];
    violations.push({ rule: 'documents.incomplete', decision: 'ESCALATE', reason: `Documentation incomplete: ${problems.join(', ')}.` });
  }

  if (history.lateReturns > BUSINESS_RULES.history.maxLateReturnsBeforeReview) {
    violations.push({
      rule: 'history.late_returns',
      decision: 'ESCALATE',
      reason: `History of late returns: ${history.lateReturns} of ${history.totalRentals} rentals returned late (${history.totalLateDays} days in total).`,
    });
  }

  if (history.damageIncidents > BUSINESS_RULES.history.maxDamageIncidentsBeforeReview) {
    violations.push({
      rule: 'history.damage',
      decision: 'ESCALATE',
      reason: `${history.damageIncidents} previous rentals returned with damage.`,
    });
  }

  if (request.totalAmount > BUSINESS_RULES.humanApprovalValueThreshold) {
    violations.push({
      rule: 'value.above_threshold',
      decision: 'ESCALATE',
      reason: `Rental value ${formatMzn(request.totalAmount)} exceeds the ${formatMzn(BUSINESS_RULES.humanApprovalValueThreshold)} automatic approval limit.`,
    });
  }

  // The QR form is public: someone typing an existing NUIT with a different email must be verified.
  const submittedEmail = request.submittedContact?.email?.toLowerCase();
  if (submittedEmail && submittedEmail !== customer.email.toLowerCase()) {
    violations.push({
      rule: 'identity.contact_mismatch',
      decision: 'ESCALATE',
      reason: `Requester email (${submittedEmail}) does not match the email on file for ${customer.companyName} — verify the requester's identity.`,
    });
  }

  // Credit exposure (outstanding payments + this rental) is the Finance Agent's job.
  return violations;
}
