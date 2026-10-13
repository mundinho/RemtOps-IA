import type { AgentName, Prisma, ReviewKind, ReviewStatus, Severity } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { AppError, notFound } from '../utils/errors.js';

/**
 * Cases ("HumanReview" table, kept for its history): situations an agent flagged.
 * In autonomous mode they are decided by the Approval Agent — never by a person —
 * and stay here as the audit trail people read.
 */

export function listReviews(filter: { status?: ReviewStatus }) {
  return prisma.humanReview.findMany({
    where: { status: filter.status },
    orderBy: [{ createdAt: 'desc' }],
    take: 200,
    include: {
      rental: {
        select: {
          id: true,
          code: true,
          status: true,
          startDate: true,
          endDate: true,
          customer: { select: { code: true, companyName: true } },
          equipment: { select: { code: true, name: true } },
        },
      },
      customer: { select: { code: true, companyName: true } },
      equipment: { select: { code: true, name: true } },
    },
  });
}

export async function createCase(data: {
  kind?: ReviewKind;
  rentalId?: string;
  customerId?: string;
  equipmentId?: string;
  executionId: string;
  requestedByAgent: AgentName;
  reason: string;
  recommendedAction: string;
  priority: Severity;
  analyzedData: Prisma.InputJsonValue;
  dedupeKey?: string;
}) {
  if (data.dedupeKey) {
    const existing = await prisma.humanReview.findUnique({ where: { dedupeKey: data.dedupeKey } });
    if (existing) return { ...existing, created: false };
  }
  return { ...(await prisma.humanReview.create({ data })), created: true };
}

/** The Approval Agent closes every open case of a rental with its decision. */
export async function resolveRentalCasesByAgent(rentalId: string, agent: AgentName, decision: 'APPROVE' | 'REJECT', notes: string) {
  const result = await prisma.humanReview.updateMany({
    where: { rentalId, kind: 'RENTAL_DECISION', status: 'PENDING' },
    data: {
      status: decision === 'APPROVE' ? 'APPROVED' : 'REJECTED',
      resolvedByAgent: agent,
      resolutionNotes: notes,
      resolvedAt: new Date(),
    },
  });
  return { resolved: result.count, decision };
}

export function listPendingAnomalies() {
  return prisma.humanReview.findMany({
    where: { kind: 'ANOMALY', status: 'PENDING' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      reason: true,
      recommendedAction: true,
      priority: true,
      analyzedData: true,
      requestedByAgent: true,
      customer: { select: { code: true, companyName: true } },
      equipment: { select: { code: true, name: true } },
    },
  });
}

/** FOLLOW_UP = the anomaly is real and stays on the radar; DISMISS = explained, no action needed. */
export async function resolveAnomalyByAgent(id: string, agent: AgentName, decision: 'FOLLOW_UP' | 'DISMISS', notes: string) {
  const review = await prisma.humanReview.findUnique({ where: { id } });
  if (!review) throw notFound('Case');
  if (review.kind !== 'ANOMALY') throw new AppError(403, 'Only anomaly cases can be triaged here');
  if (review.status !== 'PENDING') return { id, status: review.status, changed: false };

  const updated = await prisma.humanReview.update({
    where: { id },
    data: {
      status: decision === 'FOLLOW_UP' ? 'APPROVED' : 'REJECTED',
      resolvedByAgent: agent,
      resolutionNotes: `${decision === 'FOLLOW_UP' ? 'Follow-up required' : 'Dismissed'}: ${notes}`,
      resolvedAt: new Date(),
    },
  });
  return { id, status: updated.status, changed: true };
}
