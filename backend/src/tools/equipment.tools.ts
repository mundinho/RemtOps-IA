import { z } from 'zod';
import { prisma } from '../database/prisma.js';
import * as equipmentService from '../services/equipment.service.js';
import { isoDay, startOfDay } from '../utils/dates.js';
import { notFound } from '../utils/errors.js';
import { toNumber } from '../utils/money.js';
import { defineTool } from './types.js';

export const getEquipment = defineTool({
  name: 'getEquipment',
  description: 'Get the equipment of the current request: type, status, daily rate, last and next scheduled maintenance dates, and whether an operator licence is required.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const { equipmentId } = await ctx.scope();
    const e = await prisma.equipment.findUnique({ where: { id: equipmentId } });
    if (!e) throw notFound('Equipment');
    return {
      code: e.code,
      name: e.name,
      type: e.type,
      status: e.status,
      dailyRate: toNumber(e.dailyRate),
      lastMaintenanceAt: isoDay(e.lastMaintenanceAt),
      nextMaintenanceDue: isoDay(e.nextMaintenanceDue),
      maintenanceOverdue: e.nextMaintenanceDue != null && e.nextMaintenanceDue < startOfDay(),
      requiresOperatorLicense: e.requiresOperatorLicense,
    };
  },
});

export const updateEquipmentStatus = defineTool({
  name: 'updateEquipmentStatus',
  // Agents may only take equipment OUT of service. Putting it back (AVAILABLE) belongs to the workshop
  // process when the service is done — no agent has a tool for it.
  description: 'Take the equipment of the current request out of service.',
  kind: 'write',
  parameters: z.object({ status: z.enum(['BLOCKED', 'MAINTENANCE']), reason: z.string().min(1).max(300) }),
  audit: { action: 'equipment.status_changed', entityType: 'Equipment' },
  handler: async ({ status }, ctx) => {
    const { equipmentId } = await ctx.scope();
    const updated = await equipmentService.updateEquipmentStatus(equipmentId, status);
    return { id: updated.id, code: updated.code, status: updated.status };
  },
});
