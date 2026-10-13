import { prisma } from '../database/prisma.js';
import { daysFromNow, startOfDay } from '../utils/dates.js';
import { getFinanceSummary } from './payment.service.js';

const PENDING_RENTAL_STATUSES = ['REQUESTED', 'IN_REVIEW', 'REQUIRES_HUMAN_REVIEW'] as const;

/** Everything the Overview page needs, in one round trip. */
export async function getOverview() {
  const today = startOfDay();

  const [
    equipmentByStatus,
    activeRentals,
    pendingRentals,
    openAlerts,
    pendingReviews,
    maintenanceWatch,
    recentActivity,
    reviewQueue,
    alertFeed,
  ] = await Promise.all([
    prisma.equipment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.rental.count({ where: { status: 'ACTIVE' } }),
    prisma.rental.count({ where: { status: { in: [...PENDING_RENTAL_STATUSES] } } }),
    prisma.alert.count({ where: { status: 'OPEN' } }),
    prisma.humanReview.count({ where: { status: 'PENDING' } }),
    // Equipment whose service is overdue or due in the next 14 days
    prisma.equipment.findMany({
      where: {
        status: { not: 'RETIRED' },
        OR: [{ nextMaintenanceDue: { lte: daysFromNow(14) } }, { status: 'MAINTENANCE_PENDING' }],
      },
      select: { code: true, name: true, status: true, nextMaintenanceDue: true },
      orderBy: { nextMaintenanceDue: 'asc' },
    }),
    prisma.agentExecution.findMany({
      orderBy: { startedAt: 'desc' },
      take: 8,
      select: {
        id: true,
        agent: true,
        decision: true,
        summary: true,
        status: true,
        startedAt: true,
        rental: { select: { id: true, code: true } },
      },
    }),
    // Latest flagged cases decided by the AI (autonomous mode: nothing waits for a person)
    prisma.humanReview.findMany({
      where: { resolvedByAgent: { not: null } },
      orderBy: { resolvedAt: 'desc' },
      take: 5,
      select: {
        id: true,
        kind: true,
        status: true,
        reason: true,
        resolutionNotes: true,
        resolvedByAgent: true,
        resolvedAt: true,
        requestedByAgent: true,
        priority: true,
        createdAt: true,
        rental: { select: { id: true, code: true } },
        customer: { select: { code: true, companyName: true } },
        equipment: { select: { code: true, name: true } },
      },
    }),
    prisma.alert.findMany({
      where: { status: 'OPEN' },
      orderBy: [{ severity: 'desc' }, { createdAt: 'desc' }],
      take: 6,
      select: { id: true, title: true, severity: true, category: true, sourceAgent: true, createdAt: true },
    }),
  ]);

  const countStatus = (status: string) => equipmentByStatus.find((g) => g.status === status)?._count._all ?? 0;
  const since30d = daysFromNow(-30);
  const [finance, openMaintenanceOrders, approvedByAi, rejectedByAgents] = await Promise.all([
    getFinanceSummary(),
    prisma.maintenanceOrder.count({ where: { status: { in: ['OPEN', 'SCHEDULED', 'IN_PROGRESS'] } } }),
    prisma.rental.count({ where: { decidedByAgent: 'APPROVAL', status: { in: ['APPROVED', 'ACTIVE', 'COMPLETED'] }, decidedAt: { gte: since30d } } }),
    prisma.rental.count({ where: { status: 'REJECTED', decidedByAgent: { not: null }, decidedAt: { gte: since30d } } }),
  ]);

  return {
    kpis: {
      totalEquipment: equipmentByStatus.reduce((sum, g) => sum + g._count._all, 0),
      availableEquipment: countStatus('AVAILABLE'),
      rentedEquipment: countStatus('RENTED') + countStatus('RESERVED'),
      maintenanceEquipment: countStatus('MAINTENANCE') + countStatus('BLOCKED') + countStatus('MAINTENANCE_PENDING'),
      activeRentals,
      pendingRentals,
      openAlerts,
      pendingReviews,
      outstandingAmount: finance.pendingAmount + finance.overdueAmount,
      overdueAmount: finance.overdueAmount,
      openMaintenanceOrders,
      approvedByAi,
      rejectedByAgents,
    },
    maintenanceWatch: maintenanceWatch.map((e) => ({
      ...e,
      overdue: e.nextMaintenanceDue != null && e.nextMaintenanceDue < today,
    })),
    recentActivity,
    reviewQueue,
    alertFeed,
  };
}
