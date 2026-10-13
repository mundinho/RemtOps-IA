import { prisma } from '../database/prisma.js';
import type { RegistrationFacts } from '../agents/onboarding/rules.js';
import type { CustomerRegistrationInput } from '../models/schemas.js';
import { hashPassword, signToken, verifyPassword } from '../utils/auth.js';
import { isoDay } from '../utils/dates.js';
import { AppError } from '../utils/errors.js';
import { toNumber } from '../utils/money.js';
import { writeAuditLog } from './audit.service.js';
import { nextCustomerCode } from './rental.service.js';

const SELF_REGISTERED_NOTE = 'Self-registered through the customer portal.';
const invalidCredentials = () => new AppError(401, 'Invalid email or password');

// ── Staff (dashboard) ──

export async function staffLogin(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email }, omit: { passwordHash: false } });
  if (!user?.passwordHash || !(await verifyPassword(password, user.passwordHash))) throw invalidCredentials();
  if (!user.isActive) throw new AppError(403, 'This account has been deactivated');

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await writeAuditLog({ actorType: 'USER', actorId: user.email, action: 'user.login', entityType: 'User', entityId: user.id });
  return { ...signToken({ kind: 'staff', sub: user.id, role: user.role }), user: publicUser(user) };
}

export async function getStaffUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new AppError(401, 'Sign in required');
  return publicUser(user);
}

export const publicUser = (u: { id: string; name: string; email: string; role: string; isActive: boolean; lastLoginAt: Date | null; createdAt: Date }) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  isActive: u.isActive,
  lastLoginAt: u.lastLoginAt,
  createdAt: u.createdAt,
});

// ── Customers (portal) ──

/**
 * Self-registration. Nothing is activated here: the account is stored as PENDING and the
 * Onboarding Agent decides (event `customer.registered`). An existing company (same NUIT, created by
 * the admin or by a QR request) can be claimed, but its record is never overwritten from this form.
 */
export async function registerCustomer(input: CustomerRegistrationInput) {
  const existing = await prisma.customer.findUnique({ where: { taxId: input.taxId }, include: { _count: { select: { rentals: true } } } });
  if (existing?.accountStatus === 'ACTIVE' || existing?.accountStatus === 'PENDING') {
    throw new AppError(409, 'This NUIT already has an account — sign in instead', { taxId: ['This NUIT already has an account'] });
  }

  const emailOwner = await prisma.customer.findUnique({ where: { loginEmail: input.email }, select: { id: true, accountStatus: true } });
  if (emailOwner && emailOwner.id !== existing?.id && emailOwner.accountStatus !== 'REJECTED') {
    throw new AppError(409, 'This email is already used by another account', { email: ['Already used by another account'] });
  }

  // A previous self-registration that was rejected and never rented anything is just a draft: start over.
  const isOwnRejectedDraft = existing?.notes === SELF_REGISTERED_NOTE && existing._count.rentals === 0;
  const facts: RegistrationFacts = {
    submitted: { companyName: input.companyName, taxId: input.taxId, contactName: input.contactName, email: input.email, phone: input.phone },
    existingRecord:
      existing && !isOwnRejectedDraft
        ? {
            code: existing.code,
            companyName: existing.companyName,
            contactName: existing.contactName,
            email: existing.email,
            isBlocked: existing.isBlocked,
            rentals: existing._count.rentals,
          }
        : null,
  };

  const account = {
    loginEmail: input.email,
    passwordHash: await hashPassword(input.password),
    accountStatus: 'PENDING' as const,
    accountDecisionReason: null,
    accountRequestedAt: new Date(),
  };
  const companyData = {
    companyName: input.companyName,
    contactName: input.contactName,
    email: input.email,
    phone: input.phone,
  };

  const customer = await prisma.$transaction(async (tx) => {
    // A rejected account elsewhere releases the email it was holding
    if (emailOwner && emailOwner.id !== existing?.id) {
      await tx.customer.update({ where: { id: emailOwner.id }, data: { loginEmail: null } });
    }
    const saved = existing
      ? await tx.customer.update({ where: { id: existing.id }, data: { ...account, ...(isOwnRejectedDraft ? companyData : {}) } })
      : await tx.customer.create({
          data: { code: await nextCustomerCode(tx), taxId: input.taxId, ...companyData, notes: SELF_REGISTERED_NOTE, ...account },
        });
    await writeAuditLog(
      {
        actorType: 'SYSTEM',
        actorId: 'customer-portal',
        action: 'customer.registration_requested',
        entityType: 'Customer',
        entityId: saved.id,
        correlationId: saved.id,
        after: { code: saved.code, companyName: input.companyName, taxId: input.taxId, email: input.email, claimedExisting: !!facts.existingRecord },
      },
      tx,
    );
    return saved;
  });

  return { registrationId: customer.id, status: 'PENDING' as const, facts };
}

/** Polled by the registration page while the Onboarding Agent works. The id is an unguessable cuid. */
export async function getRegistrationStatus(id: string) {
  const customer = await prisma.customer.findUnique({
    where: { id },
    select: { companyName: true, loginEmail: true, accountStatus: true, accountDecisionReason: true },
  });
  if (!customer?.accountStatus) throw new AppError(404, 'Registration not found');
  return { companyName: customer.companyName, email: customer.loginEmail, status: customer.accountStatus, reason: customer.accountDecisionReason };
}

export async function customerLogin(email: string, password: string) {
  const customer = await prisma.customer.findUnique({ where: { loginEmail: email }, omit: { passwordHash: false } });
  if (!customer?.passwordHash || !(await verifyPassword(password, customer.passwordHash))) throw invalidCredentials();

  if (customer.accountStatus === 'PENDING') {
    throw new AppError(403, 'Your account is still being validated by our Onboarding Agent. Please try again in a moment.');
  }
  if (customer.accountStatus !== 'ACTIVE') {
    throw new AppError(403, `Your registration was not accepted: ${customer.accountDecisionReason ?? 'no reason recorded'}`);
  }

  await writeAuditLog({ actorType: 'SYSTEM', actorId: 'customer-portal', action: 'customer.login', entityType: 'Customer', entityId: customer.id });
  return { ...signToken({ kind: 'customer', sub: customer.id }), customer: { id: customer.id, code: customer.code, companyName: customer.companyName } };
}

/** Everything the customer portal shows: profile, documents on file and own rental requests. */
export async function getCustomerPortal(customerId: string) {
  const customer = await prisma.customer.findUniqueOrThrow({
    where: { id: customerId },
    include: {
      documents: { where: { rentalId: null }, orderBy: { expiresAt: 'desc' } },
      rentals: { orderBy: { createdAt: 'desc' }, include: { equipment: { select: { code: true, name: true } } } },
    },
  });

  return {
    profile: {
      code: customer.code,
      companyName: customer.companyName,
      taxId: customer.taxId,
      contactName: customer.contactName,
      email: customer.email,
      phone: customer.phone,
      loginEmail: customer.loginEmail,
      accountStatus: customer.accountStatus,
      accountDecisionReason: customer.accountDecisionReason,
      memberSince: customer.createdAt,
    },
    documents: customer.documents.map((d) => ({ type: d.type, status: d.status, expiresAt: isoDay(d.expiresAt) })),
    rentals: customer.rentals.map((r) => ({
      id: r.id,
      code: r.code,
      equipment: r.equipment,
      startDate: isoDay(r.startDate),
      endDate: isoDay(r.endDate),
      totalAmount: toNumber(r.totalAmount),
      status: r.status,
      customerMessage: r.customerMessage,
      approvalConditions: r.approvalConditions,
      createdAt: r.createdAt,
    })),
  };
}

/** Registrations interrupted by a restart: rebuilt from the agent run that was in progress. */
export async function listPendingRegistrations(): Promise<{ customerId: string; facts: RegistrationFacts }[]> {
  const pending = await prisma.customer.findMany({ where: { accountStatus: 'PENDING' }, select: { id: true } });
  const result: { customerId: string; facts: RegistrationFacts }[] = [];
  for (const { id } of pending) {
    const run = await prisma.agentExecution.findFirst({
      where: { agent: 'ONBOARDING', correlationId: id },
      orderBy: { startedAt: 'desc' },
      select: { input: true },
    });
    const input = run?.input as (RegistrationFacts & { customerId: string }) | null;
    if (input?.submitted) result.push({ customerId: id, facts: { submitted: input.submitted, existingRecord: input.existingRecord } });
  }
  return result;
}
