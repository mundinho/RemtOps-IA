import type { ToolSession } from '../../tools/toolExecutor.js';
import { formatMzn } from '../../utils/money.js';
import { BaseAgent, type Outcome } from '../core/BaseAgent.js';
import { fact } from '../core/facts.js';
import type { Facts } from '../core/types.js';
import { financeCheckRules } from './rules.js';

/**
 * Finance Agent — FINANCE_CHECK step (before approval).
 * Fully deterministic, no LLM: whether a customer owes money is a fact, not a judgement.
 * Showing that not every agent needs AI is part of the design.
 */
export class FinanceCheckAgent extends BaseAgent {
  readonly name = 'FINANCE' as const;
  readonly label = 'Finance Agent';
  readonly goal = 'Check that the customer has no overdue payments and stays within their credit limit.';
  protected readonly requiredFacts = ['getRentalRequest', 'getCustomer', 'getCustomerPayments'] as const;

  protected evaluateRules(facts: Facts) {
    return financeCheckRules(facts);
  }

  protected judgementRequest() {
    return null;
  }

  protected async act(outcome: Outcome<never>, tools: ToolSession) {
    if (outcome.decision !== 'ESCALATE') return;
    const request = fact.request(outcome.facts);
    await tools.run('createAlert', {
      severity: 'HIGH',
      title: `${request.customer.companyName}: payment check flagged ${request.code}`,
      message: outcome.reasons.join(' '),
    });
    await this.openCase(
      tools,
      outcome,
      'Do not approve while payments are overdue or the credit limit is exceeded.',
      'HIGH',
    );
  }

  protected summarize(outcome: Outcome<never>) {
    const payments = fact.payments(outcome.facts);
    if (outcome.decision === 'PROCEED') {
      return `Payment check passed — ${payments.outstandingAmount ? `${formatMzn(payments.outstandingAmount)} outstanding, within limit` : 'nothing outstanding'}`;
    }
    return `Escalated: ${outcome.reasons[0]}`;
  }
}

/**
 * Finance Agent — BILLING step (after approval): associates a payment with the rental.
 */
export class FinanceBillingAgent extends BaseAgent {
  readonly name = 'FINANCE' as const;
  readonly label = 'Finance Agent';
  readonly goal = 'Register the payment due for the approved rental.';
  protected readonly requiredFacts = ['getRentalRequest'] as const;

  protected evaluateRules() {
    return [];
  }

  protected judgementRequest() {
    return null;
  }

  protected async act(_outcome: Outcome<never>, tools: ToolSession) {
    const payment = (await tools.run('createPayment', {})) as { reference: string; amount: number; dueDate: string };
    return { summary: `Payment ${payment.reference} of ${formatMzn(payment.amount)} registered, due ${payment.dueDate}` };
  }

  protected summarize() {
    return 'Payment registered';
  }
}
