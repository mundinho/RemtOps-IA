import { z } from 'zod';
import * as paymentService from '../services/payment.service.js';
import { isoDay } from '../utils/dates.js';
import { defineTool } from './types.js';

export const getCustomerPayments = defineTool({
  name: 'getCustomerPayments',
  description: 'Get what the customer of the current request still owes: outstanding and overdue amounts (MZN) and the unpaid payments.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { customerId } = await ctx.scope();
    return paymentService.getCustomerPaymentSummary(customerId);
  },
});

export const createPayment = defineTool({
  name: 'createPayment',
  description: 'Register the payment due for the current (approved) rental.',
  kind: 'write',
  parameters: z.object({}),
  audit: { action: 'payment.created', entityType: 'Payment' },
  handler: async (_args, ctx) => {
    const { id } = await ctx.scope();
    const payment = await paymentService.createPaymentForRental(id);
    return { id: payment.id, reference: payment.reference, amount: payment.amount, dueDate: isoDay(payment.dueDate), created: payment.created };
  },
});

export const getPaymentsOverview = defineTool({
  name: 'getPaymentsOverview',
  description: 'Get every unpaid payment with its due date, days overdue, customer and the rental it belongs to.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => paymentService.getUnpaidPaymentsOverview(),
});

export const markPaymentOverdue = defineTool({
  name: 'markPaymentOverdue',
  description: 'Mark a pending payment whose due date has passed as overdue.',
  kind: 'write',
  parameters: z.object({ paymentReference: z.string() }),
  audit: { action: 'payment.marked_overdue', entityType: 'Payment' },
  handler: ({ paymentReference }) => paymentService.markPaymentOverdue(paymentReference),
});

export const getFinanceSummary = defineTool({
  name: 'getFinanceSummary',
  description: 'Get totals for reporting: pending, overdue and collected in the last 30 days (MZN).',
  kind: 'read',
  parameters: z.object({}),
  handler: () => paymentService.getFinanceSummary(),
});
