import type { EquipmentStatus, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { startOfDay } from '../utils/dates.js';
import { notFound } from '../utils/errors.js';
import { toNumber } from '../utils/money.js';

/** Rentals that currently occupy the equipment (approved and not yet finished). */
const occupyingRentals = (): Prisma.RentalWhereInput => ({
  status: { in: ['APPROVED', 'ACTIVE'] },
  endDate: { gte: startOfDay() },
});

const currentRentalInclude = {
  rentals: {
    where: occupyingRentals(),
    orderBy: { startDate: 'asc' },
    take: 1,
    include: { customer: { select: { code: true, companyName: true } } },
  },
  _count: { select: { maintenances: { where: { status: { not: 'RESOLVED' } } } } },
} satisfies Prisma.EquipmentInclude;

type EquipmentWithCurrent = Prisma.EquipmentGetPayload<{ include: typeof currentRentalInclude }>;

function toEquipmentDto(equipment: EquipmentWithCurrent) {
  const { rentals, _count, ...rest } = equipment;
  const current = rentals[0];
  const today = startOfDay();

  return {
    ...rest,
    dailyRate: toNumber(rest.dailyRate),
    maintenanceOverdue: rest.nextMaintenanceDue != null && rest.nextMaintenanceDue < today,
    openIssues: _count.maintenances,
    currentRental: current
      ? {
          id: current.id,
          code: current.code,
          status: current.status,
          startDate: current.startDate,
          endDate: current.endDate,
          customer: current.customer,
        }
      : null,
  };
}

export async function listEquipment() {
  const items = await prisma.equipment.findMany({ include: currentRentalInclude, orderBy: { code: 'asc' } });
  return items.map(toEquipmentDto);
}

export async function getEquipmentByCode(code: string) {
  const equipment = await prisma.equipment.findUnique({ where: { code }, include: currentRentalInclude });
  if (!equipment) throw notFound(`Equipment ${code}`);

  const [maintenances, upcomingRentals, maintenanceOrders] = await Promise.all([
    prisma.equipmentMaintenance.findMany({
      where: { equipmentId: equipment.id },
      orderBy: { reportedAt: 'desc' },
    }),
    prisma.rental.findMany({
      where: { equipmentId: equipment.id, ...occupyingRentals() },
      orderBy: { startDate: 'asc' },
      include: { customer: { select: { code: true, companyName: true } } },
    }),
    prisma.maintenanceOrder.findMany({ where: { equipmentId: equipment.id }, orderBy: { createdAt: 'desc' } }),
  ]);

  return {
    ...toEquipmentDto(equipment),
    maintenances,
    maintenanceOrders,
    upcomingRentals: upcomingRentals.map((r) => ({ ...r, dailyRate: toNumber(r.dailyRate), totalAmount: toNumber(r.totalAmount) })),
  };
}

export function updateEquipmentStatus(id: string, status: EquipmentStatus) {
  return prisma.equipment.update({ where: { id }, data: { status } });
}

/** What anyone scanning the QR code may see — no customer data, no internal notes. */
export async function getPublicEquipment(code: string) {
  const equipment = await prisma.equipment.findUnique({ where: { code } });
  if (!equipment) throw notFound(`Equipment ${code}`);

  return {
    code: equipment.code,
    name: equipment.name,
    type: equipment.type,
    brand: equipment.brand,
    model: equipment.model,
    status: equipment.status,
    location: equipment.location,
    dailyRate: toNumber(equipment.dailyRate),
    requiresOperatorLicense: equipment.requiresOperatorLicense,
  };
}
