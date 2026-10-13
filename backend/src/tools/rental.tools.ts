import { z } from 'zod';
import * as rentalService from '../services/rental.service.js';
import { isoDay } from '../utils/dates.js';
import { defineTool } from './types.js';

export const getRentalRequest = defineTool({
  name: 'getRentalRequest',
  description: 'Get the current rental request: equipment, customer, start/end dates, number of days, total amount and the intended use written by the customer.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => rentalService.getRentalForAgent((await ctx.scope()).id),
});

export const checkEquipmentAvailability = defineTool({
  name: 'checkEquipmentAvailability',
  description: 'Check whether the equipment of the current request is already booked (approved or active rentals) during the requested period.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const scope = await ctx.scope();
    const conflicts = await rentalService.findOverlappingRentals(scope.equipmentId, scope.startDate, scope.endDate, scope.id);
    return {
      requestedPeriod: { start: isoDay(scope.startDate), end: isoDay(scope.endDate) },
      available: conflicts.length === 0,
      conflicts: conflicts.map((c) => ({ code: c.code, status: c.status, start: isoDay(c.startDate), end: isoDay(c.endDate) })),
    };
  },
});

export const confirmRental = defineTool({
  name: 'confirmRental',
  description: 'Approve the current rental (with optional conditions) and reserve the equipment.',
  kind: 'write',
  parameters: z.object({
    reason: z.string().min(1).max(2000),
    conditions: z.array(z.string().min(1).max(300)).max(8).default([]),
  }),
  audit: { action: 'rental.approved', entityType: 'Rental' },
  handler: async ({ reason, conditions }, ctx) => {
    const scope = await ctx.scope();
    return rentalService.confirmRental(scope.id, scope.equipmentId, reason, conditions, ctx.agent);
  },
});

export const recordRiskAssessment = defineTool({
  name: 'recordRiskAssessment',
  description: 'Store the risk level and score assessed for the current rental.',
  kind: 'write',
  parameters: z.object({ riskLevel: z.enum(['LOW', 'MEDIUM', 'HIGH']), riskScore: z.number().int().min(0).max(100) }),
  audit: { action: 'rental.risk_assessed', entityType: 'Rental' },
  handler: async ({ riskLevel, riskScore }, ctx) =>
    rentalService.recordRiskAssessment((await ctx.scope()).id, riskLevel, riskScore),
});
