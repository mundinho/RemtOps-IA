import type { NotificationChannel, NotificationType, Severity } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { emailGateway } from '../email/gateway.js';

const PRIORITY_ORDER: Severity[] = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

/** Outbox, most urgent first. */
export async function listNotifications(limit = 200) {
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: limit,
    include: { rental: { select: { id: true, code: true } }, customer: { select: { code: true, companyName: true } } },
  });
  return notifications.sort(
    (a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority) || b.createdAt.getTime() - a.createdAt.getTime(),
  );
}

/**
 * Stores the notification, then delivers EMAIL ones through the email gateway (SMS stays simulated).
 * The outcome is recorded on the row: SENT (+ message id), FAILED (+ reason) or SIMULATED.
 * A deduplicated notification is never sent twice.
 */
export async function createNotification(data: {
  type: NotificationType;
  channel: NotificationChannel;
  recipient: string;
  subject: string;
  body: string;
  priority?: Severity;
  rentalId?: string;
  customerId?: string;
  dedupeKey?: string;
}) {
  if (data.dedupeKey) {
    const existing = await prisma.notification.findUnique({ where: { dedupeKey: data.dedupeKey } });
    if (existing) return { ...existing, created: false };
  }
  const notification = await prisma.notification.create({ data: { ...data, status: 'SIMULATED' } });
  if (data.channel !== 'EMAIL') return { ...notification, created: true };

  const delivery = await emailGateway.send({ to: data.recipient, subject: data.subject, text: data.body });
  if (delivery.status === 'SIMULATED') return { ...notification, created: true };

  const delivered = await prisma.notification.update({
    where: { id: notification.id },
    data:
      delivery.status === 'SENT'
        ? { status: 'SENT', sentAt: delivery.sentAt, providerMessageId: delivery.messageId }
        : { status: 'FAILED', deliveryError: delivery.error.slice(0, 500) },
  });
  if (delivery.status === 'FAILED') console.error(`[email] ${data.recipient}: ${delivery.error}`);
  return { ...delivered, created: true };
}
