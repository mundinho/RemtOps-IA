import { z } from 'zod';
import { prisma } from '../database/prisma.js';
import * as monitoringService from '../services/monitoring.service.js';
import * as notificationService from '../services/notification.service.js';
import { BUSINESS_RULES } from '../config/businessRules.js';
import { defineTool, type ToolContext } from './types.js';

const OPERATIONS_INBOX = 'operations@rentops.local';

const NOTIFICATION_TYPE = z.enum([
  'RENTAL_APPROVED',
  'RENTAL_REJECTED',
  'MAINTENANCE_ALERT',
  'DOCUMENTS_MISSING',
  'HUMAN_REVIEW_REQUIRED',
  'RETURN_REMINDER',
  'RETURN_OVERDUE',
  'PAYMENT_ALERT',
  'MAINTENANCE_DUE',
  'ANOMALY_REVIEW',
]);

/** Customer and rental come from the workflow, or from codes chosen by agent code during monitoring. */
async function notificationTargets(ctx: ToolContext, codes: { customerCode?: string; rentalCode?: string }) {
  if (codes.customerCode || codes.rentalCode) {
    const t = await monitoringService.resolveTargets(codes);
    return { customerId: t.customerId, rentalId: t.rentalId };
  }
  if (!ctx.rentalId) return {};
  const scope = await ctx.scope();
  return { customerId: scope.customerId, rentalId: scope.id };
}

export const createNotification = defineTool({
  name: 'createNotification',
  description: 'Send a notification to the customer or to the operations team.',
  kind: 'write',
  parameters: z.object({
    audience: z.enum(['CUSTOMER', 'OPERATIONS']),
    type: NOTIFICATION_TYPE,
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
    subject: z.string().min(1).max(200),
    body: z.string().min(1).max(3000),
    customerCode: z.string().optional(),
    rentalCode: z.string().optional(),
    dedupeKey: z.string().max(200).optional(),
  }),
  audit: { action: 'notification.created', entityType: 'Notification' },
  handler: async ({ audience, customerCode, rentalCode, ...message }, ctx) => {
    const { customerId, rentalId } = await notificationTargets(ctx, { customerCode, rentalCode });
    if (audience === 'CUSTOMER' && !customerId) throw new Error('A customer notification needs a customer');

    // The recipient is resolved from the database, never chosen by the model.
    const recipient =
      audience === 'CUSTOMER'
        ? (await prisma.customer.findUniqueOrThrow({ where: { id: customerId! }, select: { email: true } })).email
        : OPERATIONS_INBOX;

    const notification = await notificationService.createNotification({
      ...message,
      channel: audience === 'CUSTOMER' ? 'EMAIL' : 'INTERNAL',
      recipient,
      rentalId,
      customerId,
    });
    return { id: notification.id, recipient, priority: notification.priority, created: notification.created };
  },
});

export const getReturnsSchedule = defineTool({
  name: 'getReturnsSchedule',
  description: 'Get rentals that must be returned soon and rentals already past their return date.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => monitoringService.getReturnsSchedule(BUSINESS_RULES.monitoring.returnReminderDays),
});
