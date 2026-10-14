import type { AgentName, Prisma, RentalStatus, RiskLevel } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import type { RentalRequestInput } from '../models/schemas.js';
import { isoDay, rentalDays } from '../utils/dates.js';
import { AppError, notFound } from '../utils/errors.js';
import { roundMoney, toNumber } from '../utils/money.js';
import { writeAuditLog } from './audit.service.js';

const listInclude = {
  customer: { select: { code: true, companyName: true } },
  equipment: { select: { code: true, name: true, type: true } },
} satisfies Prisma.RentalInclude;

type RentalWithParties = Prisma.RentalGetPayload<{ include: typeof listInclude }>;

function toRentalDto<T extends RentalWithParties>(rental: T) {
  return { ...rental, dailyRate: toNumber(rental.dailyRate)!, totalAmount: toNumber(rental.totalAmount)! };
}

export async function listRentals(filter: { status?: RentalStatus; limit: number }) {
  const rentals = await prisma.rental.findMany({
    where: { status: filter.status },
    include: listInclude,
    orderBy: { createdAt: 'desc' },
    take: filter.limit,
  });
  return rentals.map(toRentalDto);
}

export async function getRental(id: string) {
  const rental = await prisma.rental.findUnique({
    where: { id },
    include: {
      ...listInclude,
      reviews: { orderBy: { createdAt: 'desc' } },
      notifications: { orderBy: { createdAt: 'asc' } },
      alerts: { orderBy: { createdAt: 'asc' } },
    },
  });
  if (!rental) throw notFound('Rental');
  return toRentalDto(rental);
}

/**
 * Persists the request as a Rental in status REQUESTED — the anchor of the agent workflow.
 * No business decision is taken here: availability, maintenance, risk and documents are
 * evaluated by the agents, so that every outcome is traced and explained.
 */
export async function createRentalRequest(equipmentCode: string, input: RentalRequestInput) {
  const equipment = await prisma.equipment.findUnique({ where: { code: equipmentCode } });
  if (!equipment) throw notFound(`Equipment ${equipmentCode}`);

  const dailyRate = Number(equipment.dailyRate);
  const totalAmount = roundMoney(dailyRate * rentalDays(input.startDate, input.endDate));

  return prisma.$transaction(async (tx) => {
    // Identify the company by NUIT. An existing record is NEVER overwritten from this public,
    // unauthenticated form — what was typed is stored on the rental, and the Risk Agent compares it.
    let customer = await tx.customer.findUnique({ where: { taxId: input.taxId } });
    const isNewCustomer = !customer;
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          code: await nextCustomerCode(tx),
          companyName: input.companyName,
          taxId: input.taxId,
          contactName: input.contactName,
          email: input.email,
          phone: input.phone,
          country: input.country,
          notes: 'Registered through a QR rental request — documents not yet provided.',
        },
      });
      await writeAuditLog(
        {
          actorType: 'SYSTEM',
          actorId: 'qr-intake',
          action: 'customer.created',
          entityType: 'Customer',
          entityId: customer.id,
          after: { code: customer.code, companyName: customer.companyName, taxId: customer.taxId },
        },
        tx,
      );
    }

    const rental = await tx.rental.create({
      data: {
        code: await nextRentalCode(tx),
        customerId: customer.id,
        equipmentId: equipment.id,
        startDate: input.startDate,
        endDate: input.endDate,
        dailyRate,
        totalAmount,
        intendedUse: input.intendedUse || null,
        contactName: input.contactName,
        contactEmail: input.email,
        contactPhone: input.phone,
        contactCountry: input.country,
        paymentMethod: input.paymentMethod,
      },
    });

    await writeAuditLog(
      {
        actorType: 'SYSTEM',
        actorId: 'qr-intake',
        action: 'rental.requested',
        entityType: 'Rental',
        entityId: rental.id,
        correlationId: rental.id,
        after: {
          code: rental.code,
          equipment: equipment.code,
          customer: customer.code,
          newCustomer: isNewCustomer,
          totalAmount,
          paymentMethod: input.paymentMethod,
        },
      },
      tx,
    );

    return { id: rental.id, code: rental.code, status: rental.status, customerCode: customer.code, newCustomer: isNewCustomer };
  });
}

/** Public, minimal view for the customer tracking their request. */
export async function getRequestStatus(id: string) {
  const rental = await prisma.rental.findUnique({
    where: { id },
    include: { equipment: { select: { code: true, name: true } }, customer: { select: { companyName: true } } },
  });
  if (!rental) throw notFound('Rental request');

  return {
    id: rental.id,
    code: rental.code,
    status: rental.status,
    workflowStep: rental.workflowStep,
    decisionReason: rental.decisionReason,
    startDate: rental.startDate,
    endDate: rental.endDate,
    totalAmount: toNumber(rental.totalAmount),
    paymentMethod: rental.paymentMethod,
    approvalConditions: rental.approvalConditions,
    contactName: rental.contactName,
    equipment: rental.equipment,
    customer: rental.customer,
    createdAt: rental.createdAt,
    updatedAt: rental.updatedAt,
  };
}

// ─────────────── Workflow operations (used by agent tools and the Orchestrator) ───────────────

/** The ids a workflow is scoped to. Tools resolve equipment/customer from here — never from LLM arguments. */
export async function getRentalScope(id: string) {
  const rental = await prisma.rental.findUnique({
    where: { id },
    select: { id: true, code: true, customerId: true, equipmentId: true, startDate: true, endDate: true, status: true, workflowStep: true },
  });
  if (!rental) throw notFound('Rental');
  return rental;
}

export async function getRentalForAgent(id: string) {
  const rental = await prisma.rental.findUnique({
    where: { id },
    include: { equipment: { select: { code: true, name: true, type: true } }, customer: { select: { code: true, companyName: true } } },
  });
  if (!rental) throw notFound('Rental');
  return {
    code: rental.code,
    status: rental.status,
    equipment: rental.equipment,
    customer: rental.customer,
    startDate: isoDay(rental.startDate),
    endDate: isoDay(rental.endDate),
    days: rentalDays(rental.startDate, rental.endDate),
    dailyRate: toNumber(rental.dailyRate),
    totalAmount: toNumber(rental.totalAmount),
    intendedUse: rental.intendedUse,
    decisionReason: rental.decisionReason,
    riskLevel: rental.riskLevel,
    // As typed in the QR form (unverified)
    submittedContact: { name: rental.contactName, email: rental.contactEmail, phone: rental.contactPhone, country: rental.contactCountry },
    paymentMethod: rental.paymentMethod,
    approvalConditions: rental.approvalConditions,
  };
}

/** Approved/active rentals of the same equipment whose period overlaps the given one. */
export function findOverlappingRentals(equipmentId: string, start: Date, end: Date, excludeRentalId: string) {
  return prisma.rental.findMany({
    where: {
      equipmentId,
      id: { not: excludeRentalId },
      status: { in: ['APPROVED', 'ACTIVE'] },
      startDate: { lte: end },
      endDate: { gte: start },
    },
    select: { code: true, startDate: true, endDate: true, status: true },
  });
}

/** Final approval: rental APPROVED (with any conditions) and equipment RESERVED, atomically. */
export function confirmRental(id: string, equipmentId: string, reason: string, conditions: string[], decidedBy: AgentName) {
  return prisma.$transaction(async (tx) => {
    const rental = await tx.rental.update({
      where: { id },
      data: { status: 'APPROVED', decisionReason: reason, approvalConditions: conditions, decidedByAgent: decidedBy, decidedAt: new Date() },
    });
    await tx.equipment.update({ where: { id: equipmentId }, data: { status: 'RESERVED' } });
    return { code: rental.code, status: rental.status };
  });
}

export function recordRiskAssessment(id: string, riskLevel: RiskLevel, riskScore: number) {
  return prisma.rental.update({ where: { id }, data: { riskLevel, riskScore }, select: { riskLevel: true, riskScore: true } });
}

/** Orchestrator-owned state changes (status + workflow step), always audited. */
export async function updateWorkflowState(
  id: string,
  data: Pick<Prisma.RentalUpdateInput, 'status' | 'workflowStep' | 'decisionReason' | 'decidedByAgent' | 'decidedAt'>,
  actor: { type: 'AGENT' | 'USER' | 'SYSTEM'; id: string },
) {
  const before = await prisma.rental.findUniqueOrThrow({ where: { id }, select: { status: true, workflowStep: true } });
  const after = await prisma.rental.update({ where: { id }, data, select: { status: true, workflowStep: true, decisionReason: true } });

  if (before.status !== after.status || before.workflowStep !== after.workflowStep) {
    await writeAuditLog({
      actorType: actor.type,
      actorId: actor.id,
      action: before.status !== after.status ? 'rental.status_changed' : 'rental.step_changed',
      entityType: 'Rental',
      entityId: id,
      correlationId: id,
      before,
      after: { status: after.status, workflowStep: after.workflowStep },
      metadata: after.decisionReason ? { reason: after.decisionReason } : undefined,
    });
  }
  return after;
}

/** Workflows that were interrupted (e.g. server restart) and must be resumed. */
export function listUnfinishedWorkflows() {
  return prisma.rental.findMany({
    where: { status: { in: ['REQUESTED', 'IN_REVIEW'] } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function nextCustomerCode(tx: Prisma.TransactionClient): Promise<string> {
  const last = await tx.customer.findFirst({ orderBy: { code: 'desc' }, select: { code: true } });
  const next = last ? Number(last.code.replace('CUS-', '')) + 1 : 1;
  return `CUS-${String(next).padStart(3, '0')}`;
}

async function nextRentalCode(tx: Prisma.TransactionClient): Promise<string> {
  const prefix = `RNT-${new Date().getFullYear()}-`;
  const last = await tx.rental.findFirst({
    where: { code: { startsWith: prefix } },
    orderBy: { code: 'desc' },
    select: { code: true },
  });
  const next = last ? Number(last.code.slice(prefix.length)) + 1 : 1;
  if (!Number.isFinite(next)) throw new AppError(500, 'Could not generate rental code');
  return `${prefix}${String(next).padStart(4, '0')}`;
}
