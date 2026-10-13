import type { Request, Response } from 'express';
import { z } from 'zod';
import { orchestrator } from '../agents/orchestrator/Orchestrator.js';
import { prisma } from '../database/prisma.js';
import { eventBus } from '../events/eventBus.js';
import { listMaintenanceOrders } from '../services/maintenanceOrder.service.js';
import { getFinanceSummary, listPayments } from '../services/payment.service.js';

/** Finance, maintenance orders and the monitoring cycle. */

export async function payments(req: Request, res: Response) {
  const { status } = z.object({ status: z.enum(['PENDING', 'PAID', 'OVERDUE', 'CANCELLED']).optional() }).parse(req.query);
  res.json(await listPayments({ status }));
}

export async function financeSummary(_req: Request, res: Response) {
  res.json(await getFinanceSummary());
}

export async function maintenanceOrders(req: Request, res: Response) {
  const { status } = z
    .object({ status: z.enum(['OPEN', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']).optional() })
    .parse(req.query);
  res.json(await listMaintenanceOrders({ status }));
}

/** "Run monitoring now" — the same event the scheduler emits. */
export async function runMonitoring(_req: Request, res: Response) {
  if (orchestrator.isMonitoring) {
    res.status(409).json({ error: 'A monitoring cycle is already running' });
    return;
  }
  eventBus.emit('monitoring.tick', { trigger: 'dashboard.manual' });
  res.status(202).json({ status: 'started' });
}

export async function monitoringStatus(_req: Request, res: Response) {
  const last = await prisma.agentExecution.findFirst({
    where: { agent: 'ORCHESTRATOR', correlationId: { startsWith: 'MON-' } },
    orderBy: { startedAt: 'desc' },
    select: { correlationId: true, startedAt: true, summary: true },
  });
  res.json({ running: orchestrator.isMonitoring, lastCycle: last });
}
