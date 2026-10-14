import { Prisma } from '@prisma/client';
import { env } from '../config/env.js';
import { prisma } from '../database/prisma.js';
import { MPESA_MESSAGES, mpesaGateway } from '../payments/mpesa.js';
import { normalizePhone } from '../sms/gateway.js';
import { AppError, notFound } from '../utils/errors.js';
import { roundMoney, toNumber } from '../utils/money.js';
import { writeAuditLog } from './audit.service.js';
import { nextPaymentReference } from './payment.service.js';

/**
 * M-Pesa deposit for an approved rental. The customer asks for it (button on the request page),
 * confirms with their PIN, and the deposit is recorded as a PAID payment; the balance stays on the
 * rental's pending payment, paid by other means. People never decide here either: only an
 * APPROVED rental can be paid, and every attempt is stored as an MpesaTransaction.
 */

const PAYABLE = ['APPROVED', 'ACTIVE'] as const;
/** A second push to the phone while the first is still waiting would confuse the customer. */
const IN_PROGRESS_WINDOW_MS = 3 * 60_000;

export function depositAmount(total: number): number {
  const deposit = roundMoney((total * env.MPESA_DEPOSIT_PERCENT) / 100);
  return env.MPESA_MAX_AMOUNT > 0 ? Math.min(deposit, env.MPESA_MAX_AMOUNT) : deposit;
}

/** M-Pesa is Vodacom: numbers 84 / 85 only. */
export function mpesaMsisdn(phone: string): string | null {
  const msisdn = normalizePhone(phone);
  return /^258(84|85)\d{7}$/.test(msisdn) ? msisdn : null;
}

/** What the request page shows: can it be paid, how much, and how the last attempt went. */
export async function getMpesaDeposit(rentalId: string) {
  const rental = await prisma.rental.findUnique({ where: { id: rentalId }, select: { status: true, totalAmount: true } });
  if (!rental) throw notFound('Rental request');
  const transactions = await prisma.mpesaTransaction.findMany({ where: { rentalId }, orderBy: { createdAt: 'desc' }, take: 5 });
  const paid = transactions.find((t) => t.status === 'SUCCESS');
  const last = transactions[0];

  return {
    available: (PAYABLE as readonly string[]).includes(rental.status),
    depositPercent: env.MPESA_DEPOSIT_PERCENT,
    amount: depositAmount(toNumber(rental.totalAmount) ?? 0),
    simulated: mpesaGateway.name === 'simulated',
    paid: paid ? { amount: toNumber(paid.amount), transactionId: paid.providerTransactionId, at: paid.completedAt } : null,
    lastAttempt: last ? describeAttempt(last) : null,
  };
}

/** A PENDING attempt older than the confirmation window was lost (e.g. a restart) — show it as unconfirmed. */
function describeAttempt(t: { status: 'PENDING' | 'SUCCESS' | 'FAILED'; responseCode: string | null; responseDesc: string | null; createdAt: Date }) {
  if (t.status === 'PENDING' && Date.now() - t.createdAt.getTime() >= IN_PROGRESS_WINDOW_MS) {
    return { status: 'FAILED' as const, message: MPESA_MESSAGES['INS-9'], at: t.createdAt };
  }
  return { status: t.status, message: t.responseCode ? (MPESA_MESSAGES[t.responseCode] ?? t.responseDesc) : null, at: t.createdAt };
}

export async function payDepositWithMpesa(rentalId: string, phone: string) {
  const rental = await prisma.rental.findUnique({ where: { id: rentalId }, select: { id: true, code: true, status: true, totalAmount: true, customerId: true } });
  if (!rental) throw notFound('Rental request');
  if (!(PAYABLE as readonly string[]).includes(rental.status)) throw new AppError(409, 'Only an approved rental can be paid');

  const msisdn = mpesaMsisdn(phone);
  if (!msisdn) throw new AppError(400, 'M-Pesa needs a Vodacom number (84 or 85)', { phone: ['Use a Vodacom number: 84 or 85'] });

  const previous = await prisma.mpesaTransaction.findMany({ where: { rentalId }, orderBy: { createdAt: 'desc' }, take: 5 });
  if (previous.some((t) => t.status === 'SUCCESS')) throw new AppError(409, 'The deposit for this rental is already paid');
  if (previous.some((t) => t.status === 'PENDING' && Date.now() - t.createdAt.getTime() < IN_PROGRESS_WINDOW_MS)) {
    throw new AppError(409, 'A payment request is already waiting for confirmation on the phone');
  }

  const amount = depositAmount(toNumber(rental.totalAmount) ?? 0);
  const ref = rental.code.replace(/[^A-Za-z0-9]/g, '');
  const transaction = await prisma.mpesaTransaction.create({
    data: {
      rentalId,
      msisdn,
      amount,
      transactionReference: ref.slice(0, 20),
      thirdPartyReference: `${ref}${Date.now().toString(36)}`.toUpperCase().slice(-20),
    },
  });

  // The customer confirms on the phone (up to ~90 s) — far longer than proxies keep a request open.
  // Answer now; the page polls getMpesaDeposit() until the transaction leaves PENDING.
  void completeMpesaDeposit(transaction.id, rental, msisdn, amount).catch((e) =>
    console.error(`[mpesa] ${rental.code}: ${e instanceof Error ? e.message : String(e)}`),
  );
  return { status: 'PENDING' as const, amount, message: 'Confirm the payment on your phone with your M-Pesa PIN.' };
}

async function completeMpesaDeposit(
  transactionId: string,
  rental: { id: string; customerId: string },
  msisdn: string,
  amount: number,
) {
  const rentalId = rental.id;
  const transaction = await prisma.mpesaTransaction.findUniqueOrThrow({ where: { id: transactionId } });
  const result = await mpesaGateway.c2b({
    msisdn,
    amount,
    transactionReference: transaction.transactionReference,
    thirdPartyReference: transaction.thirdPartyReference,
  });

  if (!result.ok) {
    await prisma.mpesaTransaction.update({
      where: { id: transaction.id },
      data: { status: 'FAILED', responseCode: result.code, responseDesc: result.description.slice(0, 500), completedAt: new Date() },
    });
    await writeAuditLog({
      actorType: 'SYSTEM',
      actorId: 'mpesa',
      action: 'payment.mpesa_failed',
      entityType: 'Rental',
      entityId: rentalId,
      correlationId: rentalId,
      after: { amount, msisdn, code: result.code, description: result.description },
    });
    return { ok: false as const, message: MPESA_MESSAGES[result.code] ?? `M-Pesa: ${result.description}`, code: result.code };
  }

  // Paid: record it, and take it off what is still owed on the rental.
  const reference = await prisma.$transaction(async (tx) => {
    const paymentReference = await nextPaymentReference();
    await tx.payment.create({
      data: {
        reference: paymentReference,
        rentalId,
        customerId: rental.customerId,
        amount,
        dueDate: new Date(),
        status: 'PAID',
        paidAt: new Date(),
        method: 'MPESA',
      },
    });
    const pending = await tx.payment.findFirst({ where: { rentalId, status: { in: ['PENDING', 'OVERDUE'] } }, orderBy: { createdAt: 'asc' } });
    if (pending) {
      const remaining = roundMoney(Number(pending.amount) - amount);
      await tx.payment.update({
        where: { id: pending.id },
        data: remaining > 0 ? { amount: new Prisma.Decimal(remaining) } : { amount: new Prisma.Decimal(0), status: 'PAID', paidAt: new Date() },
      });
    }
    await tx.mpesaTransaction.update({
      where: { id: transaction.id },
      data: {
        status: 'SUCCESS',
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
        entityId: rentalId,
        correlationId: rentalId,
        after: { amount, msisdn, paymentReference, transactionId: result.transactionId, simulated: mpesaGateway.name === 'simulated' },
      },
      tx,
    );
    return paymentReference;
  });

  return { ok: true as const, message: MPESA_MESSAGES['INS-0'], amount, paymentReference: reference, transactionId: result.transactionId };
}
