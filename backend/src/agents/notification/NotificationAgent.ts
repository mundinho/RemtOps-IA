import type { AgentDecision } from '@prisma/client';
import { z } from 'zod';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { formatMzn } from '../../utils/money.js';
import { BaseAgent, type JudgementRequest, type Outcome } from '../core/BaseAgent.js';
import { fact, PAYMENT_METHOD_LABELS, type CustomerFact, type RentalRequestFact } from '../core/facts.js';
import type { BaseJudgement, Facts } from '../core/types.js';

const Message = z.object({ subject: z.string().min(3).max(200), body: z.string().min(10).max(3000) });
type Message = z.infer<typeof Message> & BaseJudgement;

/**
 * Notification Agent.
 * Deterministic: WHO is notified and WHICH type (from the rental status) — recipients come from
 * the database, never from the model or the public form.
 * AI: writes the customer-facing message, adapted to the decision, its reason and any conditions.
 * If the model fails, a template is used — a notification is never lost because of the AI.
 */
export class NotificationAgent extends BaseAgent<Message> {
  readonly name = 'NOTIFICATION' as const;
  readonly label = 'Notification Agent';
  readonly goal = 'Inform the customer and the operations team about the outcome of a rental request.';
  protected readonly requiredFacts = ['getRentalRequest', 'getCustomer'] as const;
  protected readonly escalateOnMissingJudgement = false;

  protected evaluateRules() {
    return [];
  }

  protected judgementRequest(facts: Facts): JudgementRequest<Message> {
    const request = fact.request(facts);
    const customer = fact.customer(facts);
    const approved = request.status === 'APPROVED';
    return {
      instructions:
        'Write a short, professional email to the customer about their rental request. ' +
        `Outcome: ${approved ? 'the rental is APPROVED and the equipment is reserved' : 'the request was NOT APPROVED'}. ` +
        'Address the contact person by name, mention the equipment, the dates and the reference code. ' +
        (approved
          ? 'State the amount due, the payment method, that payment is due on the last rental day, and list every condition exactly. '
          : 'Explain the reason politely without internal jargon. ') +
        'Sign as "RentOps Team".',
      fields: '- "subject": string\n- "body": string (plain text, max 150 words)',
      schema: Message,
      facts: {
        contactName: customer.contactName,
        company: customer.companyName,
        reference: request.code,
        equipment: request.equipment.name,
        period: `${request.startDate} to ${request.endDate}`,
        totalAmount: formatMzn(request.totalAmount),
        paymentMethod: request.paymentMethod ? PAYMENT_METHOD_LABELS[request.paymentMethod] : 'not specified',
        status: request.status,
        reason: request.decisionReason,
        conditions: request.approvalConditions,
      },
    };
  }

  protected finalDecision(): AgentDecision {
    return 'NONE';
  }

  protected async act(outcome: Outcome<Message>, tools: ToolSession) {
    const request = fact.request(outcome.facts);
    const customer = fact.customer(outcome.facts);
    const approved = request.status === 'APPROVED';
    const message = outcome.judgement ?? templateMessage(request, customer);

    // Conditions are binding: if the model left any out, append them verbatim.
    const missing = request.approvalConditions.filter((c) => !message.body.includes(c));
    const body = missing.length ? `${message.body}\n\nConditions of this approval:\n${missing.map((c) => `- ${c}`).join('\n')}` : message.body;

    await tools.run('createNotification', {
      audience: 'CUSTOMER',
      type: approved ? 'RENTAL_APPROVED' : 'RENTAL_REJECTED',
      priority: 'MEDIUM',
      subject: message.subject,
      body,
    });

    // Operations hear about what affects them: blocked machines and conditional approvals.
    if (!approved && /maintenance|out of service|issue/i.test(request.decisionReason ?? '')) {
      await tools.run('createNotification', {
        audience: 'OPERATIONS',
        type: 'MAINTENANCE_ALERT',
        priority: 'HIGH',
        subject: `[Maintenance] ${request.equipment.code} blocked a rental request`,
        body: `${request.code} was rejected: ${request.decisionReason}\n\nSchedule the service so the machine can be rented again.`,
      });
    }
    if (approved && request.approvalConditions.length) {
      await tools.run('createNotification', {
        audience: 'OPERATIONS',
        type: 'RENTAL_APPROVED',
        priority: 'MEDIUM',
        subject: `[Conditional approval] ${request.code} — check before handover`,
        body: `${customer.companyName}, ${request.equipment.name} (${request.startDate} → ${request.endDate}).\nThe Approval Agent set these conditions:\n${request.approvalConditions.map((c) => `- ${c}`).join('\n')}`,
      });
    }
  }

  protected summarize(outcome: Outcome<Message>) {
    const request = fact.request(outcome.facts);
    const how = outcome.judgement ? 'written by AI' : 'from template';
    return `${request.status === 'APPROVED' ? 'Approval confirmation' : 'Rejection notice'} sent to customer (${how})`;
  }
}

function templateMessage(request: RentalRequestFact, customer: CustomerFact): Message {
  const approved = request.status === 'APPROVED';
  const intro = `Dear ${customer.contactName},\n\nRegarding your request ${request.code} for ${request.equipment.name} (${request.startDate} to ${request.endDate}):`;
  const outcome = approved
    ? `your rental has been approved and the equipment is reserved for you. Amount due: ${formatMzn(request.totalAmount)}${request.paymentMethod ? ` by ${PAYMENT_METHOD_LABELS[request.paymentMethod]}` : ''}, by ${request.endDate}.`
    : `unfortunately we cannot approve it. Reason: ${request.decisionReason}`;
  return {
    subject: `Rental request ${request.code} — ${approved ? 'approved' : 'not approved'}`,
    body: `${intro} ${outcome}\n\nBest regards,\nRentOps Team`,
  };
}
