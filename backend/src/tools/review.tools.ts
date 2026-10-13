import { z } from 'zod';
import { getCaseFindings as loadCaseFindings } from '../services/agentExecution.service.js';
import * as monitoringService from '../services/monitoring.service.js';
import * as reviewService from '../services/review.service.js';
import { defineTool } from './types.js';

const PRIORITY = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

// ── Opening cases (specialist agents) ──

export const openCase = defineTool({
  name: 'openCase',
  description: 'Flag a problem with the current rental for the Approval Agent, explaining why and what you recommend.',
  kind: 'write',
  parameters: z.object({
    reason: z.string().min(1).max(1000),
    recommendedAction: z.string().min(1).max(500),
    priority: PRIORITY,
    analyzedData: z.record(z.string(), z.unknown()),
  }),
  audit: { action: 'case.opened', entityType: 'HumanReview' },
  handler: async (args, ctx) => {
    const scope = await ctx.scope();
    const review = await reviewService.createCase({
      ...args,
      analyzedData: args.analyzedData as object,
      rentalId: scope.id,
      customerId: scope.customerId,
      equipmentId: scope.equipmentId,
      executionId: ctx.executionId,
      requestedByAgent: ctx.agent,
    });
    return { id: review.id, status: review.status };
  },
});

/**
 * Flags a pattern found during monitoring. Deliberately named "anomaly": the system never
 * concludes misconduct — it records data that does not fit, for the AI triage to assess.
 */
export const openAnomalyCase = defineTool({
  name: 'openAnomalyCase',
  description: 'Open an anomaly case about a customer, a machine or a rental.',
  kind: 'write',
  parameters: z.object({
    reason: z.string().min(1).max(1000),
    recommendedAction: z.string().min(1).max(500),
    priority: PRIORITY,
    analyzedData: z.record(z.string(), z.unknown()),
    customerCode: z.string().optional(),
    equipmentCode: z.string().optional(),
    rentalCode: z.string().optional(),
    dedupeKey: z.string().max(200),
  }),
  audit: { action: 'anomaly_case.opened', entityType: 'HumanReview' },
  handler: async ({ customerCode, equipmentCode, rentalCode, ...args }, ctx) => {
    const targets = await monitoringService.resolveTargets({ customerCode, equipmentCode, rentalCode });
    const review = await reviewService.createCase({
      ...args,
      kind: 'ANOMALY',
      analyzedData: args.analyzedData as object,
      customerId: targets.customerId,
      equipmentId: targets.equipmentId,
      rentalId: targets.rentalId,
      executionId: ctx.executionId,
      requestedByAgent: ctx.agent,
    });
    return { id: review.id, status: review.status, created: review.created };
  },
});

// ── Deciding cases (Approval Agent) ──

export const getCaseFindings = defineTool({
  name: 'getCaseFindings',
  description:
    'Get what the Rental, Maintenance, Risk and Finance agents concluded about the current request: their decisions, the flags they raised (with rule ids) and their AI assessments.',
  kind: 'read',
  parameters: z.object({}),
  handler: async (_args, ctx) => loadCaseFindings((await ctx.scope()).id),
});

export const resolveCase = defineTool({
  name: 'resolveCase',
  description: 'Close every open case of the current rental with the final decision.',
  kind: 'write',
  parameters: z.object({ decision: z.enum(['APPROVE', 'REJECT']), notes: z.string().min(1).max(2000) }),
  audit: { action: 'case.decided_by_ai', entityType: 'Rental' },
  handler: async ({ decision, notes }, ctx) =>
    reviewService.resolveRentalCasesByAgent((await ctx.scope()).id, ctx.agent, decision, notes),
});

export const getPendingAnomalies = defineTool({
  name: 'getPendingAnomalies',
  description: 'Get anomaly cases that have not been triaged yet.',
  kind: 'read',
  parameters: z.object({}),
  handler: () => reviewService.listPendingAnomalies(),
});

export const triageAnomaly = defineTool({
  name: 'triageAnomaly',
  description: 'Close an anomaly case: FOLLOW_UP (real issue, keep on the radar) or DISMISS (explained, no action).',
  kind: 'write',
  parameters: z.object({ caseId: z.string(), decision: z.enum(['FOLLOW_UP', 'DISMISS']), notes: z.string().min(1).max(2000) }),
  audit: { action: 'anomaly_case.triaged_by_ai', entityType: 'HumanReview' },
  handler: ({ caseId, decision, notes }, ctx) => reviewService.resolveAnomalyByAgent(caseId, ctx.agent, decision, notes),
});
