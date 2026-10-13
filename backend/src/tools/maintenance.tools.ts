import type { AgentName, AlertCategory } from '@prisma/client';
import { z } from 'zod';
import * as alertService from '../services/alert.service.js';
import * as maintenanceService from '../services/maintenance.service.js';
import * as orderService from '../services/maintenanceOrder.service.js';
import * as monitoringService from '../services/monitoring.service.js';
import { isoDay } from '../utils/dates.js';
import { defineTool, type ToolContext } from './types.js';

const SEVERITY = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const toFact = (m: Awaited<ReturnType<typeof maintenanceService.getOpenIssues>>[number]) => ({
  id: m.id,
  type: m.type,
  status: m.status,
  severity: m.severity,
  description: m.description,
  reportedAt: isoDay(m.reportedAt),
  performedAt: isoDay(m.performedAt),
  nextDueAt: isoDay(m.nextDueAt),
});

// ── Rental workflow (scoped to the current request) ──

export const getMaintenanceHistory = defineTool({
  name: 'getMaintenanceHistory',
  description: 'Get the latest maintenance records (services, inspections, repairs, issue reports) of the equipment in the current request.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { equipmentId } = await ctx.scope();
    return (await maintenanceService.getMaintenanceHistory(equipmentId)).map(toFact);
  },
});

export const getOpenIssues = defineTool({
  name: 'getOpenIssues',
  description: 'Get unresolved problems reported for the equipment in the current request. Severity is null when the issue has not been classified yet.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { equipmentId } = await ctx.scope();
    return (await maintenanceService.getOpenIssues(equipmentId)).map(toFact);
  },
});

export const classifyIssue = defineTool({
  name: 'classifyIssue',
  description: 'Set the severity of an open issue of the current equipment.',
  kind: 'write',
  parameters: z.object({ issueId: z.string(), severity: SEVERITY }),
  audit: { action: 'maintenance.issue_classified', entityType: 'EquipmentMaintenance' },
  handler: async ({ issueId, severity }, ctx) => {
    const { equipmentId } = await ctx.scope();
    const updated = await maintenanceService.classifyIssue(issueId, equipmentId, severity);
    return { id: updated.id, severity: updated.severity };
  },
});

// ── Shared: alerts ──

/** The category follows the agent, not the model: a Finance alert is always FINANCE. */
const CATEGORY_BY_AGENT: Partial<Record<AgentName, AlertCategory>> = {
  MAINTENANCE: 'MAINTENANCE',
  FINANCE: 'FINANCE',
  RISK: 'RISK',
};

async function alertTargets(ctx: ToolContext, codes: { equipmentCode?: string; customerCode?: string; rentalCode?: string }) {
  if (codes.equipmentCode || codes.customerCode || codes.rentalCode) return monitoringService.resolveTargets(codes);
  if (!ctx.rentalId) return {};
  const scope = await ctx.scope();
  return { equipmentId: scope.equipmentId, rentalId: scope.id, customerId: scope.customerId };
}

export const createAlert = defineTool({
  name: 'createAlert',
  description: 'Raise an operational alert. Targets the current request unless equipment/customer/rental codes are given.',
  kind: 'write',
  parameters: z.object({
    severity: SEVERITY,
    title: z.string().min(1).max(150),
    message: z.string().min(1).max(1500),
    equipmentCode: z.string().optional(),
    customerCode: z.string().optional(),
    rentalCode: z.string().optional(),
    dedupeKey: z.string().max(200).optional(),
  }),
  audit: { action: 'alert.created', entityType: 'Alert' },
  handler: async ({ equipmentCode, customerCode, rentalCode, ...alert }, ctx) => {
    const { equipmentId, rentalId, customerId } = await alertTargets(ctx, { equipmentCode, customerCode, rentalCode });
    const created = await alertService.createAlert({
      ...alert,
      category: CATEGORY_BY_AGENT[ctx.agent] ?? 'OPERATIONS',
      sourceAgent: ctx.agent,
      equipmentId,
      rentalId,
      customerId,
    });
    return { id: created.id, title: created.title, severity: created.severity, created: created.created };
  },
});

// ── Monitoring (fleet-wide) ──

export const getFleetMaintenanceStatus = defineTool({
  name: 'getFleetMaintenanceStatus',
  description: 'Get engine hours since last service, service interval, next service date, open work orders and recent utilisation for every machine.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => monitoringService.getFleetMaintenanceStatus(),
});

export const getRecentIssueReports = defineTool({
  name: 'getRecentIssueReports',
  description: 'Get recent problem reports and repairs, grouped by machine, for machines with several reports.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => monitoringService.getRecentIssueReports(),
});

export const createMaintenanceOrder = defineTool({
  name: 'createMaintenanceOrder',
  description: 'Open a maintenance work order for a machine (skipped if an order of the same type is already open).',
  kind: 'write',
  parameters: z.object({
    equipmentCode: z.string(),
    type: z.enum(['PREVENTIVE', 'CORRECTIVE', 'INSPECTION']),
    priority: SEVERITY,
    reason: z.string().min(1).max(500),
    dueInDays: z.number().int().min(0).max(90).optional(),
  }),
  audit: { action: 'maintenance_order.created', entityType: 'MaintenanceOrder' },
  handler: (args, ctx) => orderService.createMaintenanceOrder({ ...args, createdByAgent: ctx.agent }),
});

export const flagEquipmentForMaintenance = defineTool({
  name: 'flagEquipmentForMaintenance',
  description: "Set an AVAILABLE machine to 'maintenance pending' so it is not rented before its service.",
  kind: 'write',
  parameters: z.object({ equipmentCode: z.string(), reason: z.string().min(1).max(300) }),
  audit: { action: 'equipment.maintenance_pending', entityType: 'Equipment' },
  handler: ({ equipmentCode }) => monitoringService.flagEquipmentForMaintenance(equipmentCode),
});
