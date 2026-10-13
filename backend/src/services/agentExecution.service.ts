import type { AgentDecision, AgentName, Prisma, ToolCallSource, ToolCallStatus, WorkflowStep } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { notFound } from '../utils/errors.js';

export function listExecutions(filter: { agent?: AgentName; correlationId?: string; limit: number }) {
  return prisma.agentExecution.findMany({
    where: { agent: filter.agent, correlationId: filter.correlationId },
    orderBy: { startedAt: 'desc' },
    take: filter.limit,
    include: {
      rental: { select: { id: true, code: true, equipment: { select: { code: true } } } },
      _count: { select: { toolCalls: true } },
    },
  });
}

export async function getExecution(id: string) {
  const execution = await prisma.agentExecution.findUnique({
    where: { id },
    include: {
      toolCalls: { orderBy: { createdAt: 'asc' } },
      rental: { select: { id: true, code: true } },
    },
  });
  if (!execution) throw notFound('Agent execution');
  return execution;
}

/**
 * Everything the specialist agents concluded about a rental — the dossier the Approval Agent reads.
 * Each flag keeps its rule id, so policy can tell which flags the AI may weigh and which it may not.
 */
export async function getCaseFindings(rentalId: string) {
  const executions = await prisma.agentExecution.findMany({
    where: { rentalId, agent: { in: ['RENTAL', 'MAINTENANCE', 'RISK', 'FINANCE'] } },
    orderBy: { startedAt: 'asc' },
    select: { agent: true, status: true, decision: true, summary: true, reasoning: true, confidence: true, output: true },
  });

  return executions.map((e) => {
    const output = (e.output ?? {}) as { violations?: { rule: string; decision: string; reason: string }[] };
    return {
      agent: e.agent,
      status: e.status,
      decision: e.decision,
      summary: e.summary,
      flags: output.violations ?? [],
      aiAssessment: e.reasoning,
      aiConfidence: e.confidence,
    };
  });
}

export function startExecution(data: {
  agent: AgentName;
  correlationId: string;
  /** Absent for monitoring runs. */
  rentalId?: string;
  step?: WorkflowStep;
  trigger: string;
  input?: Prisma.InputJsonValue;
}) {
  return prisma.agentExecution.create({ data: { ...data, status: 'RUNNING' } });
}

export function finishExecution(
  id: string,
  startedAt: Date,
  result: {
    status: 'SUCCEEDED' | 'FAILED';
    decision: AgentDecision;
    summary: string;
    reasoning?: string;
    confidence?: number | null;
    output?: Prisma.InputJsonValue;
    usedLLM: boolean;
    model?: string | null;
    inputTokens?: number;
    outputTokens?: number;
    policyOverride?: boolean;
    error?: string;
  },
) {
  const finishedAt = new Date();
  return prisma.agentExecution.update({
    where: { id },
    data: { ...result, finishedAt, durationMs: finishedAt.getTime() - startedAt.getTime() },
  });
}

export function recordToolCall(data: {
  executionId: string;
  toolName: string;
  source: ToolCallSource;
  arguments: Prisma.InputJsonValue;
  result?: Prisma.InputJsonValue;
  status: ToolCallStatus;
  errorMessage?: string;
  durationMs: number;
}) {
  return prisma.agentToolCall.create({ data });
}
