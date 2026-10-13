import type { RentalStatus } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { toNumber } from '../utils/money.js';

/** Outcome buckets used by every rental chart. */
const OUTCOME: Record<RentalStatus, 'approved' | 'rejected' | 'inProgress' | null> = {
  APPROVED: 'approved',
  ACTIVE: 'approved',
  COMPLETED: 'approved',
  REJECTED: 'rejected',
  REQUESTED: 'inProgress',
  IN_REVIEW: 'inProgress',
  REQUIRES_HUMAN_REVIEW: 'inProgress',
  CANCELLED: null,
};

/** Rule ids (as recorded by the agents) → readable label for the "why rejected" chart. */
const RULE_LABELS: Record<string, string> = {
  'customer.blocked': 'Customer account blocked',
  'documents.incomplete': 'Documents missing or expired',
  'history.late_returns': 'History of late returns',
  'history.damage': 'History of damage',
  'value.above_threshold': 'Value above automatic limit',
  'identity.contact_mismatch': 'Email does not match NUIT',
  'payments.overdue': 'Overdue payments',
  'credit.limit_exceeded': 'Credit limit exceeded',
};

const MONTHS_BACK = 6;
const MONTHS_AHEAD = 1;

/** Aggregates for the Statistics page. Everything is computed from the same tables the agents write. */
export async function getStatistics() {
  const [rentals, payments, equipment, executions] = await Promise.all([
    prisma.rental.findMany({
      select: {
        id: true,
        status: true,
        startDate: true,
        totalAmount: true,
        paymentMethod: true,
        equipment: { select: { code: true, name: true } },
      },
    }),
    prisma.payment.findMany({ select: { status: true, amount: true } }),
    prisma.equipment.groupBy({ by: ['status'], _count: true }),
    prisma.agentExecution.findMany({
      where: { durationMs: { not: null } },
      select: { agent: true, rentalId: true, step: true, startedAt: true, finishedAt: true, durationMs: true, inputTokens: true, outputTokens: true },
    }),
  ]);

  // ── KPIs ──
  const approved = rentals.filter((r) => OUTCOME[r.status] === 'approved');
  const rejected = rentals.filter((r) => OUTCOME[r.status] === 'rejected');
  const decided = approved.length + rejected.length;
  // Time the agents took per request: first workflow run started → last one finished
  const workflowSpan = new Map<string, { start: number; end: number }>();
  for (const e of executions) {
    if (!e.rentalId || !e.step || !e.finishedAt) continue;
    const span = workflowSpan.get(e.rentalId) ?? { start: Infinity, end: 0 };
    span.start = Math.min(span.start, e.startedAt.getTime());
    span.end = Math.max(span.end, e.finishedAt.getTime());
    workflowSpan.set(e.rentalId, span);
  }
  const decisionTimes = [...workflowSpan.values()].map((s) => (s.end - s.start) / 1000);

  // ── Rentals per month (by start date), split by outcome ──
  const now = new Date();
  const months = Array.from({ length: MONTHS_BACK + MONTHS_AHEAD + 1 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK + i, 1);
    return { key: monthKey(d), approved: 0, rejected: 0, inProgress: 0 };
  });
  for (const r of rentals) {
    const bucket = months.find((m) => m.key === monthKey(r.startDate));
    const outcome = OUTCOME[r.status];
    if (bucket && outcome) bucket[outcome]++;
  }

  // ── Why requests were rejected: rule violations recorded on rejected rentals ──
  const rejectedIds = rejected.map((r) => r.id);
  const rejectionRuns = rejectedIds.length
    ? await prisma.agentExecution.findMany({ where: { rentalId: { in: rejectedIds } }, select: { rentalId: true, output: true } })
    : [];
  const rulesByRental = new Map<string, Set<string>>();
  for (const run of rejectionRuns) {
    const violations = (run.output as { violations?: { rule?: string }[] } | null)?.violations ?? [];
    for (const v of violations) {
      if (!v.rule) continue;
      const rule = v.rule.replace(/^locked:/, '');
      const set = rulesByRental.get(run.rentalId!) ?? new Set<string>();
      set.add(rule);
      rulesByRental.set(run.rentalId!, set);
    }
  }
  const reasonCounts = new Map<string, number>();
  for (const id of rejectedIds) {
    const rules = rulesByRental.get(id);
    if (!rules?.size) {
      reasonCounts.set('Other / AI judgement', (reasonCounts.get('Other / AI judgement') ?? 0) + 1);
      continue;
    }
    for (const rule of rules) {
      const label = RULE_LABELS[rule] ?? humanize(rule);
      reasonCounts.set(label, (reasonCounts.get(label) ?? 0) + 1);
    }
  }

  // ── Revenue booked per machine (approved, active, completed) ──
  const revenueByEquipment = new Map<string, { label: string; value: number }>();
  for (const r of approved) {
    const entry = revenueByEquipment.get(r.equipment.code) ?? { label: r.equipment.name, value: 0 };
    entry.value += toNumber(r.totalAmount) ?? 0;
    revenueByEquipment.set(r.equipment.code, entry);
  }

  // ── Payment methods chosen on requests ──
  const methodCounts = new Map<string, number>();
  for (const r of rentals) if (r.paymentMethod) methodCounts.set(r.paymentMethod, (methodCounts.get(r.paymentMethod) ?? 0) + 1);

  // ── Payments by status (amount) ──
  const paymentAmounts = new Map<string, number>();
  for (const p of payments) paymentAmounts.set(p.status, (paymentAmounts.get(p.status) ?? 0) + (toNumber(p.amount) ?? 0));

  // ── Agents: runs, average duration, tokens ──
  const agents = new Map<string, { runs: number; totalMs: number; tokens: number }>();
  for (const e of executions) {
    if (e.agent === 'ORCHESTRATOR') continue; // coordinates only, no work of its own
    const a = agents.get(e.agent) ?? { runs: 0, totalMs: 0, tokens: 0 };
    a.runs++;
    a.totalMs += e.durationMs ?? 0;
    a.tokens += (e.inputTokens ?? 0) + (e.outputTokens ?? 0);
    agents.set(e.agent, a);
  }

  return {
    kpis: {
      totalRequests: rentals.length,
      approved: approved.length,
      rejected: rejected.length,
      inProgress: rentals.filter((r) => OUTCOME[r.status] === 'inProgress').length,
      approvalRate: decided ? approved.length / decided : null,
      revenueBooked: approved.reduce((sum, r) => sum + (toNumber(r.totalAmount) ?? 0), 0),
      avgDecisionSeconds: decisionTimes.length ? Math.round(average(decisionTimes)) : null,
      llmTokens: executions.reduce((sum, e) => sum + (e.inputTokens ?? 0) + (e.outputTokens ?? 0), 0),
    },
    rentalsByMonth: months,
    rejectionReasons: sortDesc([...reasonCounts].map(([label, value]) => ({ label, value }))),
    revenueByEquipment: sortDesc([...revenueByEquipment.values()]),
    paymentMethods: sortDesc([...methodCounts].map(([label, value]) => ({ label, value }))),
    paymentsByStatus: sortDesc([...paymentAmounts].map(([label, value]) => ({ label, value }))),
    fleetStatus: sortDesc(equipment.map((e) => ({ label: e.status, value: e._count }))),
    agents: sortDesc(
      [...agents].map(([agent, a]) => ({
        label: agent,
        runs: a.runs,
        value: Math.round(a.totalMs / a.runs / 100) / 10, // average seconds, 1 decimal
        tokens: a.tokens,
      })),
    ),
  };
}

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const humanize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1).replace(/[._]/g, ' ');
const sortDesc = <T extends { value: number }>(xs: T[]) => xs.sort((a, b) => b.value - a.value);
