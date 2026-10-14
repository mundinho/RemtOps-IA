import { z } from 'zod';
import { prisma } from '../database/prisma.js';
import * as monitoringService from '../services/monitoring.service.js';
import * as notificationService from '../services/notification.service.js';
import { BUSINESS_RULES } from '../config/businessRules.js';
import { env } from '../config/env.js';
import { defineTool, type ToolContext } from './types.js';

const OPERATIONS_INBOX = 'operations@rentops.local';

/**
 * Which events also send an SMS, and its exact text. Only a confirmed rental does — short, plain and
 * without accents (GSM-7, one credit). Other events (rejections, reminders…) go by email only.
 */
const SMS_TEXT: Partial<Record<z.infer<typeof NOTIFICATION_TYPE>, string>> = {
  RENTAL_APPROVED: 'Equipamento alugado com sucesso',
};

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

    // Recipients are resolved from the database (or configuration), never chosen by the model.
    if (audience === 'OPERATIONS') {
      const notification = await notificationService.createNotification({
        ...message,
        channel: env.OPERATIONS_EMAIL ? 'EMAIL' : 'INTERNAL',
        recipient: env.OPERATIONS_EMAIL || OPERATIONS_INBOX,
        rentalId,
        customerId,
      });
      return { id: notification.id, recipient: notification.recipient, priority: notification.priority, created: notification.created };
    }

    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: customerId! }, select: { email: true, phone: true } });
    const notification = await notificationService.createNotification({
      ...message,
      channel: 'EMAIL',
      recipient: customer.email,
      rentalId,
      customerId,
    });

    // Plus one SMS for the events that have a fixed SMS text (one credit each). It goes to the phone typed
    // in the rental form — the person who is renting — or, without one, to the phone on the customer record.
    let sms: { id: string; status: string } | undefined;
    const smsText = SMS_TEXT[message.type];
    const rentalPhone = rentalId
      ? (await prisma.rental.findUnique({ where: { id: rentalId }, select: { contactPhone: true } }))?.contactPhone
      : null;
    const smsTo = rentalPhone || customer.phone;
    if (smsText && smsTo) {
      const created = await notificationService.createNotification({
        type: message.type,
        priority: message.priority,
        channel: 'SMS',
        recipient: smsTo,
        subject: message.subject,
        body: smsText,
        rentalId,
        customerId,
        // One SMS per rental and event, even if the notification step runs again
        dedupeKey: `SMS:${message.type}:${rentalId ?? message.dedupeKey ?? customerId}`,
      });
      sms = { id: created.id, status: created.status };
    }
    return { id: notification.id, recipient: customer.email, priority: notification.priority, created: notification.created, sms };
  },
});

export const getReturnsSchedule = defineTool({
  name: 'getReturnsSchedule',
  description: 'Get rentals that must be returned soon and rentals already past their return date.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => monitoringService.getReturnsSchedule(BUSINESS_RULES.monitoring.returnReminderDays),
});
