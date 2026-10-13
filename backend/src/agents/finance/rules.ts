import { BUSINESS_RULES } from '../../config/businessRules.js';
import { formatMzn } from '../../utils/money.js';
import { fact } from '../core/facts.js';
import type { Facts, RuleViolation } from '../core/types.js';

/** Money decisions are rules, not AI: overdue debt and credit exposure. */
export function financeCheckRules(facts: Facts): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const payments = fact.payments(facts);
  const customer = fact.customer(facts);
  const request = fact.request(facts);

  if (payments.overdueCount > 0) {
    violations.push({
      rule: 'payments.overdue',
      decision: 'ESCALATE',
      reason: `Customer has ${payments.overdueCount} overdue payment(s) totalling ${formatMzn(payments.overdueAmount)} (oldest ${payments.oldestOverdueDays} days overdue).`,
    });
  }

  const exposure = payments.outstandingAmount + request.totalAmount;
  if (customer.creditLimit != null && exposure > customer.creditLimit) {
    violations.push({
      rule: 'credit.limit_exceeded',
      decision: 'ESCALATE',
      reason: `Credit exposure ${formatMzn(exposure)} (outstanding ${formatMzn(payments.outstandingAmount)} + this rental ${formatMzn(request.totalAmount)}) exceeds the credit limit of ${formatMzn(customer.creditLimit)}.`,
    });
  }

  if (request.paymentMethod === 'CASH' && request.totalAmount > BUSINESS_RULES.maxCashPayment) {
    violations.push({
      rule: 'payment.cash_limit',
      decision: 'ESCALATE',
      reason: `Cash payment of ${formatMzn(request.totalAmount)} exceeds the ${formatMzn(BUSINESS_RULES.maxCashPayment)} cash limit — manager approval required.`,
    });
  }

  return violations;
}
