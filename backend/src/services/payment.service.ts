import type { PaymentStatus, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { daysFromNow, isoDay, startOfDay } from '../utils/dates.js';
import { notFound } from '../utils/errors.js';
import { toNumber } from '../utils/money.js';

const DAY_MS = 86_400_000;
const UNPAID: PaymentStatus[] = ['PENDING', 'OVERDUE'];

/** What a customer currently owes — read by the Finance Agent before approving a new rental. */
export async function getCustomerPaymentSummary(customerId: string) {
  const unpaid = await prisma.payment.findMany({
    where: { customerId, status: { in: UNPAID } },
    include: { rental: { select: { code: true } } },
    orderBy: { dueDate: 'asc' },
  });
  const today = startOfDay();
  const overdue = unpaid.filter((p) => p.status === 'OVERDUE' || p.dueDate < today);

  return {
    outstandingAmount: unpaid.reduce((sum, p) => sum + Number(p.amount), 0),
    overdueCount: overdue.length,
    overdueAmount: overdue.reduce((sum, p) => sum + Number(p.amount), 0),
    oldestOverdueDays: overdue.length ? Math.round((today.getTime() - overdue[0]!.dueDate.getTime()) / DAY_MS) : 0,
    unpaid: unpaid.map((p) => ({
      reference: p.reference,
      rental: p.rental.code,
      amount: Number(p.amount),
      dueDate: isoDay(p.dueDate),
      status: p.status,
    })),
  };
}

/** One payment per rental, due on the last rental day. Idempotent: returns the existing one if present. */
export async function createPaymentForRental(rentalId: string) {
  const existing = await prisma.payment.findFirst({ where: { rentalId } });
  if (existing) return { ...existing, amount: Number(existing.amount), created: false };

  const rental = await prisma.rental.findUnique({ where: { id: rentalId } });
  if (!rental) throw notFound('Rental');

  const payment = await prisma.payment.create({
    data: {
      reference: await nextPaymentReference(),
      rentalId,
      customerId: rental.customerId,
      amount: rental.totalAmount,
      dueDate: rental.endDate,
      method: rental.paymentMethod, // as chosen by the customer in the QR form
    },
  });
  return { ...payment, amount: Number(payment.amount), created: true };
}

export async function markPaymentOverdue(reference: string) {
  const payment = await prisma.payment.findUnique({ where: { reference } });
  if (!payment) throw notFound(`Payment ${reference}`);
  if (payment.status !== 'PENDING') return { reference, status: payment.status, changed: false };
  const updated = await prisma.payment.update({ where: { reference }, data: { status: 'OVERDUE' } });
  return { id: updated.id, reference, status: updated.status, changed: true };
}

/** Unpaid payments with the rental context the monitoring cycle needs. */
export async function getUnpaidPaymentsOverview() {
  const today = startOfDay();
  const payments = await prisma.payment.findMany({
    where: { status: { in: UNPAID } },
    include: {
      rental: { select: { code: true, status: true, endDate: true, equipment: { select: { code: true, name: true } } } },
      customer: { select: { code: true, companyName: true } },
    },
    orderBy: { dueDate: 'asc' },
  });

  return payments.map((p) => ({
    reference: p.reference,
    amount: Number(p.amount),
    status: p.status,
    dueDate: isoDay(p.dueDate),
    daysOverdue: p.dueDate < today ? Math.round((today.getTime() - p.dueDate.getTime()) / DAY_MS) : 0,
    customer: p.customer,
    rental: {
      code: p.rental.code,
      status: p.rental.status,
      endDate: isoDay(p.rental.endDate),
      daysUntilEnd: Math.round((startOfDay(p.rental.endDate).getTime() - today.getTime()) / DAY_MS),
      equipment: p.rental.equipment,
    },
  }));
}

/** Figures for the Finance dashboard and reports. */
export async function getFinanceSummary() {
  const [byStatus, collected30d] = await Promise.all([
    prisma.payment.groupBy({ by: ['status'], _sum: { amount: true }, _count: { _all: true } }),
    prisma.payment.aggregate({ where: { status: 'PAID', paidAt: { gte: daysFromNow(-30) } }, _sum: { amount: true } }),
  ]);
  const sum = (s: PaymentStatus) => Number(byStatus.find((b) => b.status === s)?._sum.amount ?? 0);
  const count = (s: PaymentStatus) => byStatus.find((b) => b.status === s)?._count._all ?? 0;

  return {
    currency: 'MZN',
    pendingAmount: sum('PENDING'),
    pendingCount: count('PENDING'),
    overdueAmount: sum('OVERDUE'),
    overdueCount: count('OVERDUE'),
    collectedLast30Days: toNumber(collected30d._sum.amount) ?? 0,
  };
}

export async function listPayments(filter: { status?: PaymentStatus }) {
  const where: Prisma.PaymentWhereInput = { status: filter.status };
  const payments = await prisma.payment.findMany({
    where,
    orderBy: [{ status: 'asc' }, { dueDate: 'desc' }],
    take: 200,
    include: {
      rental: { select: { id: true, code: true, endDate: true, equipment: { select: { code: true, name: true } } } },
      customer: { select: { code: true, companyName: true } },
    },
  });
  return payments.map((p) => ({ ...p, amount: Number(p.amount) }));
}

export async function nextPaymentReference(): Promise<string> {
  const prefix = `PAY-${new Date().getFullYear()}-`;
  const last = await prisma.payment.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const next = last ? Number(last.reference.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}
