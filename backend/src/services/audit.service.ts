import type { ActorType, Prisma } from '@prisma/client';
import { prisma } from '../database/prisma.js';

export interface AuditEntry {
  actorType: ActorType;
  actorId: string;
  action: string;
  entityType: string;
  entityId: string;
  correlationId?: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  metadata?: Prisma.InputJsonValue;
}

export function writeAuditLog(entry: AuditEntry, db: Prisma.TransactionClient = prisma) {
  return db.auditLog.create({ data: entry });
}

export function listAuditLogs(filter: { entityType?: string; entityId?: string; correlationId?: string; limit: number }) {
  const { limit, ...where } = filter;
  return prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, take: limit });
}
