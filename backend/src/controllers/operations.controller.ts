import type { Request, Response } from 'express';
import { buildReport, REPORT_TYPES } from '../services/report.service.js';
import { staffOf } from '../middleware/auth.js';
import { IdParam } from '../models/schemas.js';
import { getStaffUser } from '../services/auth.service.js';
import { listRefunds, markRefunded } from '../services/mpesa.service.js';
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

/** M-Pesa deposits of rejected/cancelled requests: to refund in the M-Pesa portal, and already refunded. */
export async function refunds(_req: Request, res: Response) {
  res.json(await listRefunds());
}

/** Finance confirms it refunded the deposit in the M-Pesa portal (a person did it — so it is audited by name). */
export async function markRefund(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  const { note } = z.object({ note: z.string().trim().max(500).optional() }).parse(req.body ?? {});
  const actor = await getStaffUser(staffOf(res).sub);
  res.json(await markRefunded(id, actor.email, note));
}

/** Management reports (financial, rentals, fleet, agents) for a date range; the dashboard exports them. */
export async function report(req: Request, res: Response) {
  const { type } = z.object({ type: z.enum(REPORT_TYPES) }).parse(req.params);
  const { from, to } = z
    .object({ from: z.iso.date(), to: z.iso.date() })
    .refine((q) => q.to >= q.from, { message: '"to" must be on or after "from"', path: ['to'] })
    .parse(req.query);
  res.json(await buildReport(type, new Date(`${from}T00:00:00`), new Date(`${to}T00:00:00`)));
}
