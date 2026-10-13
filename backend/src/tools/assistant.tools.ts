import { z } from 'zod';
import { BUSINESS_RULES } from '../config/businessRules.js';
import { prisma } from '../database/prisma.js';
import { isoDay, rentalDays, startOfDay } from '../utils/dates.js';
import { AppError, notFound } from '../utils/errors.js';
import { formatMzn } from '../utils/money.js';
import { defineTool, type ToolContext } from './types.js';

/**
 * Tools of the customer-facing assistant. All READ-ONLY and public-safe:
 * they never return other customers' identities, internal notes, risk scores or agent reasoning.
 * The machine is the one whose QR code was scanned (ctx.equipmentCode) — the model cannot pick another.
 */

const isoDate = z.iso.date();

async function scannedEquipment(ctx: ToolContext) {
  if (!ctx.equipmentCode) throw new AppError(400, 'No equipment in this conversation');
  const equipment = await prisma.equipment.findUnique({ where: { code: ctx.equipmentCode } });
  if (!equipment) throw notFound(`Equipment ${ctx.equipmentCode}`);
  return equipment;
}

const OUT_OF_SERVICE = ['MAINTENANCE', 'MAINTENANCE_PENDING', 'BLOCKED', 'RETIRED'];

export const getMachineInfo = defineTool({
  name: 'getMachineInfo',
  description: 'Get the details of this machine: name, type, brand/model, daily rate (MZN), location, whether an operator licence is required, and whether it is in service.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const e = await scannedEquipment(ctx);
    return {
      code: e.code,
      name: e.name,
      type: e.type,
      brand: e.brand,
      model: e.model,
      dailyRate: formatMzn(Number(e.dailyRate)),
      location: e.location,
      operatorLicenceRequired: e.requiresOperatorLicense,
      inService: !OUT_OF_SERVICE.includes(e.status),
    };
  },
});

export const checkDatesAvailability = defineTool({
  name: 'checkDatesAvailability',
  description: 'Check whether this machine is free between two dates (YYYY-MM-DD) and estimate the price for that period.',
  kind: 'read',
  parameters: z.object({ startDate: isoDate, endDate: isoDate }),
  handler: async ({ startDate, endDate }, ctx) => {
    const e = await scannedEquipment(ctx);
    const start = new Date(`${startDate}T00:00:00`);
    const end = new Date(`${endDate}T00:00:00`);
    if (end < start) return { error: 'The end date is before the start date.' };
    if (start < startOfDay()) return { error: 'The start date is in the past.' };

    const days = rentalDays(start, end);
    const bookings = await prisma.rental.findMany({
      where: { equipmentId: e.id, status: { in: ['APPROVED', 'ACTIVE'] }, startDate: { lte: end }, endDate: { gte: start } },
      select: { startDate: true, endDate: true },
    });
    const inService = !OUT_OF_SERVICE.includes(e.status);
    const available = bookings.length === 0 && inService;
    const total = formatMzn(days * Number(e.dailyRate));

    return {
      // Plain-language verdict first: small models answer far more reliably from a sentence than from JSON.
      summary: available
        ? `AVAILABLE from ${startDate} to ${endDate} (${days} days). Estimated total ${total}.`
        : !inService
          ? `NOT AVAILABLE from ${startDate} to ${endDate}: the machine is currently out of service for maintenance.`
          : `NOT AVAILABLE from ${startDate} to ${endDate}: already booked ${bookings.map((b) => `${isoDay(b.startDate)} → ${isoDay(b.endDate)}`).join(', ')}.`,
      period: { startDate, endDate, days },
      available,
      // Periods only — never who booked them
      busyPeriods: bookings.map((b) => ({ from: isoDay(b.startDate), to: isoDay(b.endDate) })),
      currentlyInService: inService,
      estimatedTotal: total,
      exceedsMaxDuration: days > BUSINESS_RULES.maxRentalDays,
    };
  },
});

export const getRentalPolicy = defineTool({
  name: 'getRentalPolicy',
  description: 'Get how renting works: required documents, accepted payment methods, payment terms, limits and how requests are decided.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    const e = ctx.equipmentCode ? await prisma.equipment.findUnique({ where: { code: ctx.equipmentCode } }) : null;
    return {
      currency: 'MZN',
      requiredDocuments: [
        'Valid identity document',
        'Valid insurance certificate',
        ...(e?.requiresOperatorLicense ? ['Operator licence (required for this machine)'] : []),
      ],
      paymentMethods: ['M-Pesa', 'e-Mola', 'Bank transfer', 'Card', `Cash (up to ${formatMzn(BUSINESS_RULES.maxCashPayment)})`],
      paymentTerms: 'Nothing is charged when requesting. Payment is due on the last day of the rental.',
      maxRentalDays: BUSINESS_RULES.maxRentalDays,
      howToRequest: 'Fill in the form on this page (company, NUIT, contact, dates, intended use, payment method) and submit.',
      howDecisionsAreMade:
        'Automated checks (availability, maintenance, documents, history, payments) followed by an automatic decision — usually within minutes. Approvals can include conditions.',
    };
  },
});

export const getMyRequestStatus = defineTool({
  name: 'getMyRequestStatus',
  description: "Get the status of the customer's own rental request in this conversation: decision, reason, conditions, amount and payment method.",
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => {
    if (!ctx.rentalId) return { error: 'There is no rental request in this conversation. The customer can submit one with the form.' };
    const r = await prisma.rental.findUniqueOrThrow({
      where: { id: ctx.rentalId },
      include: { equipment: { select: { name: true } } },
    });
    return {
      reference: r.code,
      equipment: r.equipment.name,
      period: { from: isoDay(r.startDate), to: isoDay(r.endDate) },
      status: r.status,
      stepInProgress: r.workflowStep,
      decisionReason: r.decisionReason,
      conditions: r.approvalConditions,
      totalAmount: formatMzn(Number(r.totalAmount)),
      paymentMethod: r.paymentMethod,
    };
  },
});
