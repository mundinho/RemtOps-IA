import type { Severity } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { AppError } from '../utils/errors.js';

export function getMaintenanceHistory(equipmentId: string, limit = 10) {
  return prisma.equipmentMaintenance.findMany({
    where: { equipmentId },
    orderBy: { reportedAt: 'desc' },
    take: limit,
  });
}

export function getOpenIssues(equipmentId: string) {
  return prisma.equipmentMaintenance.findMany({
    where: { equipmentId, status: { not: 'RESOLVED' } },
    orderBy: { reportedAt: 'desc' },
  });
}

/** Sets the severity of an open issue. The issue must belong to the given equipment (scope check). */
export async function classifyIssue(issueId: string, equipmentId: string, severity: Severity) {
  const issue = await prisma.equipmentMaintenance.findUnique({ where: { id: issueId } });
  if (!issue || issue.equipmentId !== equipmentId) {
    throw new AppError(403, `Issue ${issueId} does not belong to the equipment in this request`);
  }
  return prisma.equipmentMaintenance.update({ where: { id: issueId }, data: { severity } });
}
