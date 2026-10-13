import type { NotificationChannel, NotificationType, Severity } from '@prisma/client';
import { prisma } from '../database/prisma.js';

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

/** PoC: notifications are stored as SIMULATED instead of going through a real email/SMS gateway. */
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
  return { ...(await prisma.notification.create({ data: { ...data, status: 'SIMULATED' } })), created: true };
}
