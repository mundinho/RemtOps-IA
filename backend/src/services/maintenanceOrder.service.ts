import type { AgentName, MaintenanceOrderStatus, MaintenanceOrderType, Severity } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { daysFromNow } from '../utils/dates.js';
import { notFound } from '../utils/errors.js';

const OPEN_STATUSES: MaintenanceOrderStatus[] = ['OPEN', 'SCHEDULED', 'IN_PROGRESS'];

/**
 * Creates a work order unless one of the same type is already open for this machine
 * (the monitoring cycle runs repeatedly — it must not pile up duplicate orders).
 */
export async function createMaintenanceOrder(input: {
  equipmentCode: string;
  type: MaintenanceOrderType;
  priority: Severity;
  reason: string;
  dueInDays?: number;
  createdByAgent: AgentName;
}) {
  const equipment = await prisma.equipment.findUnique({ where: { code: input.equipmentCode } });
  if (!equipment) throw notFound(`Equipment ${input.equipmentCode}`);

  const existing = await prisma.maintenanceOrder.findFirst({
    where: { equipmentId: equipment.id, type: input.type, status: { in: OPEN_STATUSES } },
  });
  if (existing) return { id: existing.id, code: existing.code, created: false };

  const order = await prisma.maintenanceOrder.create({
    data: {
      code: await nextOrderCode(),
      equipmentId: equipment.id,
      type: input.type,
      priority: input.priority,
      reason: input.reason,
      createdByAgent: input.createdByAgent,
      dueBy: input.dueInDays != null ? daysFromNow(input.dueInDays) : null,
    },
  });
  return { id: order.id, code: order.code, created: true };
}

export function listMaintenanceOrders(filter: { status?: MaintenanceOrderStatus; equipmentId?: string }) {
  return prisma.maintenanceOrder.findMany({
    where: { status: filter.status, equipmentId: filter.equipmentId },
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    include: { equipment: { select: { code: true, name: true, status: true } } },
  });
}

async function nextOrderCode(): Promise<string> {
  const prefix = `MO-${new Date().getFullYear()}-`;
  const last = await prisma.maintenanceOrder.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const next = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
