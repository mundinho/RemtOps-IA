import type { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { eventBus } from '../events/eventBus.js';
import { RentalRequestSchema } from '../models/schemas.js';
import { MPESA_MESSAGES, mpesaGateway } from '../payments/mpesa.js';
import { normalizePhone } from '../sms/gateway.js';
import { rentalDays } from '../utils/dates.js';
import { AppError, notFound } from '../utils/errors.js';
import { roundMoney, toNumber } from '../utils/money.js';
import { writeAuditLog } from './audit.service.js';
import { nextPaymentReference } from './payment.service.js';
import { createRentalRequest } from './rental.service.js';

/**
 * M-Pesa checkout — the deposit is paid BEFORE the rental request exists.
 *
 *   1. startCheckout     validate the QR form, compute the deposit, store the form, push the PIN prompt
 *   2. (customer)        confirms with the M-Pesa PIN on the phone
 *   3. completeCheckout  paid → the rental request is created and handed to the agents, the deposit is
 *                        recorded as a PAID payment; failed → nothing is created, the form can be resent
 *
 * If the agents then reject the request, the deposit shows up as a refund to do (manual, in the
 * M-Pesa portal) until finance marks it refunded. Every attempt is kept as an MpesaTransaction.
 */

/** A second PIN prompt while the first is still waiting would confuse the customer. */
const IN_PROGRESS_WINDOW_MS = 3 * 60_000;
/** A gateway may keep a payment PENDING for up to ~15 min (Emedx Pay); only after that is it treated as lost. */
const LOST_AFTER_MS = 17 * 60_000;

export function depositAmount(total: number): number {
  const deposit = roundMoney((total * env.MPESA_DEPOSIT_PERCENT) / 100);
  return env.MPESA_MAX_AMOUNT > 0 ? Math.min(deposit, env.MPESA_MAX_AMOUNT) : deposit;
}

/** M-Pesa is Vodacom: numbers 84 / 85 only. */
export function mpesaMsisdn(phone: string): string | null {
  const msisdn = normalizePhone(phone);
  return /^258(84|85)\d{7}$/.test(msisdn) ? msisdn : null;
}

/** What the QR form shows before paying: total, deposit and the share it represents. */
export async function quoteDeposit(equipmentCode: string, startDate: string, endDate: string) {
  const equipment = await prisma.equipment.findUnique({ where: { code: equipmentCode }, select: { dailyRate: true } });
  if (!equipment) throw notFound(`Equipment ${equipmentCode}`);
  const days = rentalDays(new Date(`${startDate}T00:00:00`), new Date(`${endDate}T00:00:00`));
  const total = roundMoney(Number(equipment.dailyRate) * days);
  return { total, deposit: depositAmount(total), depositPercent: env.MPESA_DEPOSIT_PERCENT };
}

export async function startCheckout(equipmentCode: string, form: Record<string, unknown>, payerPhone: string) {
  // Same validation as a normal request — nothing is charged for a form the API would refuse.
  const input = RentalRequestSchema.parse({ ...form, paymentMethod: 'MPESA' });
  const msisdn = mpesaMsisdn(payerPhone);
  if (!msisdn) throw new AppError(400, 'M-Pesa needs a Vodacom number (84 or 85)', { mpesaPhone: ['Use a Vodacom number: 84 or 85'] });

  const recent = await prisma.mpesaTransaction.findFirst({
    where: { msisdn, status: 'PENDING', createdAt: { gt: new Date(Date.now() - IN_PROGRESS_WINDOW_MS) } },
  });
  if (recent) throw new AppError(409, 'A payment request is already waiting for confirmation on this phone');

  const { total, deposit } = await quoteDeposit(equipmentCode, String(form.startDate), String(form.endDate));
  if (deposit < 1) throw new AppError(400, 'The deposit is below the M-Pesa minimum of 1 MZN');

  const ref = `RENT${equipmentCode.replace(/[^A-Za-z0-9]/g, '')}`;
  const transaction = await prisma.mpesaTransaction.create({
    data: {
      equipmentCode,
      requestPayload: { ...form, paymentMethod: 'MPESA' } as Prisma.InputJsonValue,
      msisdn,
      amount: deposit,
      transactionReference: ref.slice(0, 20),
      thirdPartyReference: `${ref}${Date.now().toString(36)}`.toUpperCase().slice(-20),
    },
  });

  // The customer confirms on the phone (up to ~90 s) — longer than proxies keep a request open.
  void completeCheckout(transaction.id).catch((e) => console.error(`[mpesa] checkout ${transaction.id}: ${e instanceof Error ? e.message : String(e)}`));
  return { checkoutId: transaction.id, status: 'PENDING' as const, amount: deposit, total, email: input.email };
}

async function completeCheckout(transactionId: string) {
  const transaction = await prisma.mpesaTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  const amount = Number(transaction.amount);
  const result = await mpesaGateway.c2b({
    msisdn: transaction.msisdn,
    amount,
    transactionReference: transaction.transactionReference,
    thirdPartyReference: transaction.thirdPartyReference,
  });

  if (!result.ok) {
    await prisma.mpesaTransaction.update({
      where: { id: transactionId },
      data: { status: 'FAILED', responseCode: result.code, responseDesc: result.description.slice(0, 500), completedAt: new Date() },
    });
    await writeAuditLog({
      actorType: 'SYSTEM',
      actorId: 'mpesa',
      action: 'payment.mpesa_failed',
      entityType: 'MpesaTransaction',
      entityId: transactionId,
      after: { amount, msisdn: transaction.msisdn, code: result.code, description: result.description },
    });
    return;
  }

  // Paid → now the request exists, and the agents take over.
  const request = await createRentalRequest(transaction.equipmentCode!, RentalRequestSchema.parse(transaction.requestPayload));
  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: request.id }, select: { customerId: true } });

  const paymentReference = await nextPaymentReference();
  await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        reference: paymentReference,
        rentalId: request.id,
        customerId: rental.customerId,
        amount,
        dueDate: new Date(),
        status: 'PAID',
        paidAt: new Date(),
        method: 'MPESA',
        kind: 'DEPOSIT',
      },
    });
    await tx.mpesaTransaction.update({
      where: { id: transactionId },
      data: {
        status: 'SUCCESS',
        rentalId: request.id,
        providerTransactionId: result.transactionId,
        conversationId: result.conversationId,
        responseCode: result.code,
        responseDesc: result.description.slice(0, 500),
        paymentReference,
        completedAt: new Date(),
      },
    });
    await writeAuditLog(
      {
        actorType: 'SYSTEM',
        actorId: 'mpesa',
        action: 'payment.mpesa_received',
        entityType: 'Rental',
        entityId: request.id,
        correlationId: request.id,
        after: { amount, msisdn: transaction.msisdn, paymentReference, transactionId: result.transactionId, simulated: mpesaGateway.name === 'simulated' },
      },
      tx,
    );
  });
  eventBus.emit('rental.requested', { rentalId: request.id });
}

/** Polled by the QR form while the customer confirms on the phone. */
export async function getCheckout(id: string) {
  const t = await prisma.mpesaTransaction.findUnique({ where: { id } });
  if (!t || !t.equipmentCode) throw notFound('Payment');
  const lost = t.status === 'PENDING' && Date.now() - t.createdAt.getTime() >= LOST_AFTER_MS;
  const status = lost ? 'FAILED' : t.status;
  return {
    status,
    amount: toNumber(t.amount),
    rentalId: t.rentalId,
    transactionId: t.providerTransactionId,
    message: status === 'FAILED' ? (lost ? MPESA_MESSAGES['INS-9'] : (MPESA_MESSAGES[t.responseCode ?? ''] ?? `M-Pesa: ${t.responseDesc}`)) : null,
  };
}

/** The deposit of a rental, for its request page: paid, and whether it must be / was refunded. */
export async function getRentalDeposit(rentalId: string) {
  const [rental, paid] = await Promise.all([
    prisma.rental.findUnique({ where: { id: rentalId }, select: { status: true } }),
    prisma.mpesaTransaction.findFirst({ where: { rentalId, status: 'SUCCESS' } }),
  ]);
  if (!rental) throw notFound('Rental request');
  if (!paid) return null;
  return {
    amount: toNumber(paid.amount),
    transactionId: paid.providerTransactionId,
    paidAt: paid.completedAt,
    refund: rental.status === 'REJECTED' || rental.status === 'CANCELLED' ? { refundedAt: paid.refundedAt } : null,
    simulated: mpesaGateway.name === 'simulated',
  };
}

// ── Manual refunds (finance) ──

/** Deposits paid for requests that were then rejected or cancelled: to refund, and already refunded. */
export async function listRefunds() {
  const rows = await prisma.mpesaTransaction.findMany({
    where: { status: 'SUCCESS', rental: { status: { in: ['REJECTED', 'CANCELLED'] } } },
    include: { rental: { select: { id: true, code: true, decisionReason: true, customer: { select: { code: true, companyName: true } } } } },
    orderBy: { completedAt: 'desc' },
  });
  return rows.map((t) => ({
    id: t.id,
    amount: toNumber(t.amount),
    msisdn: t.msisdn,
    transactionId: t.providerTransactionId,
    paidAt: t.completedAt,
    rental: t.rental,
    refundedAt: t.refundedAt,
    refundedBy: t.refundedBy,
    refundNote: t.refundNote,
  }));
}

export async function markRefunded(id: string, actor: string, note?: string) {
  const t = await prisma.mpesaTransaction.findUnique({ where: { id }, include: { rental: { select: { status: true } } } });
  if (!t || t.status !== 'SUCCESS') throw notFound('Paid M-Pesa deposit');
  if (!t.rental || !['REJECTED', 'CANCELLED'].includes(t.rental.status)) throw new AppError(409, 'Only deposits of rejected or cancelled requests are refunded');
  if (t.refundedAt) throw new AppError(409, 'This deposit was already marked as refunded');

  await prisma.$transaction(async (tx) => {
    await tx.mpesaTransaction.update({ where: { id }, data: { refundedAt: new Date(), refundedBy: actor, refundNote: note || null } });
    if (t.paymentReference) await tx.payment.update({ where: { reference: t.paymentReference }, data: { status: 'CANCELLED' } });
    await writeAuditLog(
      {
        actorType: 'USER',
        actorId: actor,
        action: 'payment.mpesa_refunded',
        entityType: 'Rental',
        entityId: t.rentalId!,
        correlationId: t.rentalId!,
        after: { amount: toNumber(t.amount), msisdn: t.msisdn, transactionId: t.providerTransactionId, note: note || null },
      },
      tx,
    );
  });
  return { id, refunded: true };
}
