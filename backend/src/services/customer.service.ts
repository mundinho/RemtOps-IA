import { Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import type { CustomerInput } from '../models/schemas.js';
import { isoDay, startOfDay } from '../utils/dates.js';
import { AppError, notFound } from '../utils/errors.js';
import { toNumber } from '../utils/money.js';
import { writeAuditLog } from './audit.service.js';
import { nextCustomerCode } from './rental.service.js';

/** Dashboard list; the public QR form also uses it for its "fill with demo data" helper. */
export async function listCustomers() {
  const customers = await prisma.customer.findMany({
    include: {
      // Customer-level documents only (ID, insurance, licence…), newest first
      documents: { where: { rentalId: null }, orderBy: { expiresAt: 'desc' } },
      _count: { select: { rentals: true } },
    },
    orderBy: { code: 'asc' },
  });
  return customers.map(({ documents, _count, creditLimit, ...customer }) => ({
    ...customer,
    creditLimit: toNumber(creditLimit),
    rentalCount: _count.rentals,
    documents: documents.map((d) => ({
      type: d.type,
      status: d.status,
      documentNumber: d.documentNumber,
      expiresAt: isoDay(d.expiresAt),
    })),
  }));
}

/**
 * Admin registration (dashboard → Customers). The documents sent are the ones the admin checked:
 * they replace the customer-level documents on file and are VALID until they expire.
 */
export async function createCustomer(input: CustomerInput, actor = 'admin') {
  await assertTaxIdFree(input.taxId);
  return prisma.$transaction(async (tx) => {
    const customer = await tx.customer.create({
      data: { ...customerData(input), code: await nextCustomerCode(tx), documents: { create: documentData(input) } },
    });
    await writeAuditLog(
      {
        actorType: 'USER',
        actorId: actor,
        action: 'customer.created',
        entityType: 'Customer',
        entityId: customer.id,
        after: { code: customer.code, companyName: customer.companyName, taxId: customer.taxId, documents: input.documents.map((d) => d.type) },
      },
      tx,
    );
    return customer;
  });
}

export async function updateCustomer(id: string, input: CustomerInput, actor = 'admin') {
  const before = await getCustomer(id);
  if (before.taxId !== input.taxId) await assertTaxIdFree(input.taxId);

  return prisma.$transaction(async (tx) => {
    await tx.rentalDocument.deleteMany({ where: { customerId: id, rentalId: null } });
    const customer = await tx.customer.update({
      where: { id },
      data: { ...customerData(input), documents: { create: documentData(input) } },
    });
    await writeAuditLog(
      {
        actorType: 'USER',
        actorId: actor,
        action: 'customer.updated',
        entityType: 'Customer',
        entityId: id,
        before: { companyName: before.companyName, taxId: before.taxId, email: before.email },
        after: { companyName: customer.companyName, taxId: customer.taxId, email: customer.email, documents: input.documents.map((d) => d.type) },
      },
      tx,
    );
    return customer;
  });
}

async function assertTaxIdFree(taxId: string) {
  const existing = await prisma.customer.findUnique({ where: { taxId }, select: { code: true } });
  if (existing) throw new AppError(409, `NUIT ${taxId} is already registered (${existing.code})`, { taxId: [`Already registered as ${existing.code}`] });
}

const customerData = (input: CustomerInput) => ({
  companyName: input.companyName,
  taxId: input.taxId,
  contactName: input.contactName,
  email: input.email,
  phone: input.phone ?? null,
  country: input.country,
  creditLimit: input.creditLimit == null ? null : new Prisma.Decimal(input.creditLimit),
  notes: input.notes || null,
});

const documentData = (input: CustomerInput) => {
  const today = startOfDay();
  return input.documents.map((d) => ({
    type: d.type,
    documentNumber: d.documentNumber || null,
    expiresAt: d.expiresAt,
    status: d.expiresAt >= today ? ('VALID' as const) : ('EXPIRED' as const),
    verificationNotes: 'Checked and registered by an admin in the dashboard.',
  }));
};

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw notFound('Customer');
  return customer;
}

/** Past rentals plus the aggregates the Risk Agent reasons about. */
export async function getCustomerRentalHistory(customerId: string, excludeRentalId?: string) {
  const rentals = await prisma.rental.findMany({
    where: { customerId, id: { not: excludeRentalId }, status: { in: ['COMPLETED', 'ACTIVE', 'APPROVED'] } },
    orderBy: { startDate: 'desc' },
    include: { equipment: { select: { code: true, name: true } } },
  });

  return {
    totalRentals: rentals.length,
    lateReturns: rentals.filter((r) => r.lateDays > 0).length,
    totalLateDays: rentals.reduce((sum, r) => sum + r.lateDays, 0),
    damageIncidents: rentals.filter((r) => r.damageReported).length,
    lifetimeValue: rentals.reduce((sum, r) => sum + (toNumber(r.totalAmount) ?? 0), 0),
    rentals: rentals.slice(0, 10).map((r) => ({
      code: r.code,
      equipment: r.equipment.name,
      start: isoDay(r.startDate),
      end: isoDay(r.endDate),
      status: r.status,
      lateDays: r.lateDays,
      damage: r.damageNotes,
    })),
  };
}
