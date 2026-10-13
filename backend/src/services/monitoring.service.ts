import { BUSINESS_RULES } from '../config/businessRules.js';
import { prisma } from '../database/prisma.js';
import { daysFromNow, isoDay, rentalDays, startOfDay } from '../utils/dates.js';
import { notFound } from '../utils/errors.js';

/**
 * Fleet-wide read queries for the proactive monitoring cycle.
 * Pure reads — what to do with the results is decided by the agents' rules.
 */

const DAY_MS = 86_400_000;
const daysBetween = (from: Date, to: Date) => Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / DAY_MS);

/** Engine hours, service dates, open work orders and recent utilisation of every active machine. */
export async function getFleetMaintenanceStatus() {
  const today = startOfDay();
  const since90 = daysFromNow(-90);
  const equipment = await prisma.equipment.findMany({
    where: { status: { not: 'RETIRED' } },
    orderBy: { code: 'asc' },
    include: {
      maintenanceOrders: { where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } }, select: { code: true, type: true } },
      rentals: { where: { status: { in: ['ACTIVE', 'COMPLETED', 'APPROVED'] }, endDate: { gte: since90 } }, select: { startDate: true, endDate: true } },
    },
  });

  return equipment.map((e) => {
    const hoursSinceService = e.usageHours - e.hoursAtLastService;
    const rentedDaysLast90 = e.rentals.reduce((sum, r) => {
      const start = r.startDate < since90 ? since90 : r.startDate;
      const end = r.endDate > today ? today : r.endDate;
      return sum + Math.max(0, rentalDays(start, end));
    }, 0);
    return {
      code: e.code,
      name: e.name,
      status: e.status,
      usageHours: e.usageHours,
      hoursSinceService,
      serviceIntervalHours: e.serviceIntervalHours,
      hoursRatio: e.serviceIntervalHours ? Math.round((hoursSinceService / e.serviceIntervalHours) * 100) / 100 : null,
      nextMaintenanceDue: isoDay(e.nextMaintenanceDue),
      daysUntilDue: e.nextMaintenanceDue ? daysBetween(today, e.nextMaintenanceDue) : null,
      openOrders: e.maintenanceOrders,
      utilisationLast90Days: Math.round((rentedDaysLast90 / 90) * 100) / 100,
    };
  });
}

/** Issue reports in the recent window, grouped by machine (only machines with several reports). */
export async function getRecentIssueReports() {
  const { recurringIssueWindowDays, recurringIssueMinReports } = BUSINESS_RULES.monitoring;
  const reports = await prisma.equipmentMaintenance.findMany({
    where: { type: { in: ['ISSUE_REPORT', 'REPAIR'] }, reportedAt: { gte: daysFromNow(-recurringIssueWindowDays) } },
    orderBy: { reportedAt: 'asc' },
    include: { equipment: { select: { code: true, name: true } } },
  });

  const groups = new Map<string, { equipment: { code: string; name: string }; reports: { date: string | null; status: string; description: string }[] }>();
  for (const r of reports) {
    const group = groups.get(r.equipment.code) ?? { equipment: r.equipment, reports: [] };
    group.reports.push({ date: isoDay(r.reportedAt), status: r.status, description: r.description });
    groups.set(r.equipment.code, group);
  }
  return [...groups.values()].filter((g) => g.reports.length >= recurringIssueMinReports);
}

/** Late-return counts over each customer's most recent completed rentals. */
export async function getCustomerReturnPatterns() {
  const { window } = BUSINESS_RULES.monitoring.lateReturnPattern;
  const customers = await prisma.customer.findMany({
    orderBy: { code: 'asc' },
    include: {
      rentals: {
        where: { status: 'COMPLETED' },
        orderBy: { endDate: 'desc' },
        take: window,
        select: { code: true, endDate: true, lateDays: true },
      },
    },
  });
  return customers.map((c) => ({
    code: c.code,
    companyName: c.companyName,
    lastRentals: c.rentals.length,
    lateInLastRentals: c.rentals.filter((r) => r.lateDays > 0).length,
    lateDaysInLastRentals: c.rentals.reduce((sum, r) => sum + r.lateDays, 0),
    rentals: c.rentals.map((r) => ({ code: r.code, end: isoDay(r.endDate), lateDays: r.lateDays })),
  }));
}

/** Data that contradicts itself: overdue returns, status mismatches, impossible meter readings. */
export async function getOperationalConsistency() {
  const today = startOfDay();

  const [overdueReturns, occupiedEquipment, meterReadings] = await Promise.all([
    prisma.rental.findMany({
      where: { status: 'ACTIVE', endDate: { lt: today } },
      include: { customer: { select: { code: true, companyName: true } }, equipment: { select: { code: true, name: true } } },
    }),
    prisma.equipment.findMany({
      where: { status: { in: ['RENTED', 'RESERVED'] } },
      include: {
        rentals: {
          where: { status: { in: ['APPROVED', 'ACTIVE'] }, endDate: { gte: daysFromNow(-30) } },
          select: { code: true },
        },
      },
    }),
    prisma.rental.findMany({
      where: { status: 'COMPLETED', hoursUsed: { not: null }, endDate: { gte: daysFromNow(-450) } },
      include: { customer: { select: { code: true, companyName: true } }, equipment: { select: { code: true, name: true } } },
    }),
  ]);

  return {
    overdueReturns: overdueReturns.map((r) => ({
      rental: r.code,
      customer: r.customer,
      equipment: r.equipment,
      endDate: isoDay(r.endDate),
      daysOverdue: daysBetween(r.endDate, today),
    })),
    statusMismatches: occupiedEquipment
      .filter((e) => e.rentals.length === 0)
      .map((e) => ({ equipment: { code: e.code, name: e.name }, status: e.status })),
    implausibleUsage: meterReadings
      .map((r) => {
        const days = rentalDays(r.startDate, r.endDate);
        return {
          rental: r.code,
          customer: r.customer,
          equipment: r.equipment,
          days,
          hoursUsed: r.hoursUsed!,
          hoursPerDay: Math.round((r.hoursUsed! / days) * 10) / 10,
        };
      })
      .filter((r) => r.hoursPerDay > BUSINESS_RULES.monitoring.maxPlausibleHoursPerDay),
  };
}

/** Active/approved rentals ending within `withinDays` (reminders) and those already past due. */
export async function getReturnsSchedule(withinDays: number) {
  const today = startOfDay();
  const rentals = await prisma.rental.findMany({
    where: { status: { in: ['ACTIVE', 'APPROVED'] }, endDate: { lte: daysFromNow(withinDays) } },
    include: {
      customer: { select: { code: true, companyName: true, contactName: true, email: true } },
      equipment: { select: { code: true, name: true } },
    },
    orderBy: { endDate: 'asc' },
  });
  const rows = rentals.map((r) => ({
    rentalId: r.id,
    rental: r.code,
    customer: r.customer,
    equipment: r.equipment,
    endDate: isoDay(r.endDate)!,
    daysUntilEnd: daysBetween(today, r.endDate),
  }));
  return { upcoming: rows.filter((r) => r.daysUntilEnd >= 0), overdue: rows.filter((r) => r.daysUntilEnd < 0) };
}

/** Resolves human-readable codes (chosen by agent code from findings) to ids. */
export async function resolveTargets(codes: { equipmentCode?: string; customerCode?: string; rentalCode?: string }) {
  const [equipment, customer, rental] = await Promise.all([
    codes.equipmentCode ? prisma.equipment.findUnique({ where: { code: codes.equipmentCode }, select: { id: true } }) : null,
    codes.customerCode ? prisma.customer.findUnique({ where: { code: codes.customerCode }, select: { id: true, email: true } }) : null,
    codes.rentalCode ? prisma.rental.findUnique({ where: { code: codes.rentalCode }, select: { id: true, customerId: true } }) : null,
  ]);
  if (codes.equipmentCode && !equipment) throw notFound(`Equipment ${codes.equipmentCode}`);
  if (codes.customerCode && !customer) throw notFound(`Customer ${codes.customerCode}`);
  if (codes.rentalCode && !rental) throw notFound(`Rental ${codes.rentalCode}`);
  return { equipmentId: equipment?.id, customerId: customer?.id ?? rental?.customerId, rentalId: rental?.id, customerEmail: customer?.email };
}

/** Takes a machine out of the rentable pool pending service — only if it is currently AVAILABLE. */
export async function flagEquipmentForMaintenance(equipmentCode: string) {
  const equipment = await prisma.equipment.findUnique({ where: { code: equipmentCode } });
  if (!equipment) throw notFound(`Equipment ${equipmentCode}`);
  if (equipment.status !== 'AVAILABLE') return { id: equipment.id, code: equipmentCode, status: equipment.status, changed: false };
  const updated = await prisma.equipment.update({ where: { id: equipment.id }, data: { status: 'MAINTENANCE_PENDING' } });
  return { id: updated.id, code: equipmentCode, status: updated.status, changed: true };
}
