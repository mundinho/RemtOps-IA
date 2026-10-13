import type { AgentName, AlertCategory, AlertStatus, Severity } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export function listAlerts(filter: { status?: AlertStatus }) {
  return prisma.alert.findMany({
    where: { status: filter.status },
    orderBy: { createdAt: 'desc' },
    include: {
      equipment: { select: { code: true, name: true } },
      rental: { select: { id: true, code: true } },
      customer: { select: { code: true, companyName: true } },
    },
  });
}

/** Creates an alert; with a dedupeKey, the same condition never produces a second alert. */
export async function createAlert(data: {
  sourceAgent: AgentName;
  category: AlertCategory;
  severity: Severity;
  title: string;
  message: string;
  equipmentId?: string;
  rentalId?: string;
  customerId?: string;
  dedupeKey?: string;
}) {
  if (data.dedupeKey) {
    const existing = await prisma.alert.findUnique({ where: { dedupeKey: data.dedupeKey } });
    if (existing) return { ...existing, created: false };
  }
  return { ...(await prisma.alert.create({ data })), created: true };
}
