import type { AgentName } from '@prisma/client';
import { prisma } from '../database/prisma.js';
import { isoDay } from '../utils/dates.js';
import { roundMoney } from '../utils/money.js';

/**
 * Management reports. Every report has the same shape, so the dashboard renders, exports (CSV) and
 * prints (PDF) any of them the same way:
 *   kpis        headline figures
 *   breakdowns  distributions for the charts
 *   table       the detail rows (what goes to Excel)
 * Read-only: reports never change data.
 */

export type ValueFormat = 'money' | 'number' | 'percent' | 'seconds' | 'text' | 'date';

export interface Report {
  type: ReportType;
  title: string;
  period: { from: string; to: string; days: number };
  generatedAt: string;
  kpis: { label: string; value: number | string; format: ValueFormat; hint?: string }[];
  breakdowns: { title: string; format: ValueFormat; items: { label: string; value: number }[] }[];
  table: { columns: { key: string; label: string; format?: ValueFormat }[]; rows: Record<string, string | number | null>[] };
}

export const REPORT_TYPES = ['financial', 'rentals', 'fleet', 'agents'] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

const DAY_MS = 86_400_000;
const PAYMENT_METHOD_LABELS: Record<string, string> = { MPESA: 'M-Pesa', EMOLA: 'e-Mola', BANK_TRANSFER: 'Bank transfer', CARD: 'Card', CASH: 'Cash' };

function group<T>(items: T[], key: (t: T) => string, value: (t: T) => number = () => 1) {
  const map = new Map<string, number>();
  for (const item of items) map.set(key(item), (map.get(key(item)) ?? 0) + value(item));
  return [...map.entries()].map(([label, v]) => ({ label, value: roundMoney(v) })).sort((a, b) => b.value - a.value);
}

const sum = (values: number[]) => roundMoney(values.reduce((a, b) => a + b, 0));

export async function buildReport(type: ReportType, from: Date, to: Date): Promise<Report> {
  // `to` is inclusive: the whole last day counts
  const end = new Date(to.getTime() + DAY_MS);
  const period = { from: isoDay(from)!, to: isoDay(to)!, days: Math.max(1, Math.round((end.getTime() - from.getTime()) / DAY_MS)) };
  const base = { type, period, generatedAt: new Date().toISOString() };
  switch (type) {
    case 'financial':
      return { ...base, ...(await financial(from, end)) };
    case 'rentals':
      return { ...base, ...(await rentals(from, end)) };
    case 'fleet':
      return { ...base, ...(await fleet(from, end, period.days)) };
    case 'agents':
      return { ...base, ...(await agents(from, end)) };
  }
}

// ── Financial ──

async function financial(from: Date, end: Date) {
  const [paid, approved, unpaid, refundsDue, refunded] = await Promise.all([
    prisma.payment.findMany({
      where: { status: 'PAID', paidAt: { gte: from, lt: end }, amount: { gt: 0 } },
      include: { customer: { select: { code: true, companyName: true } }, rental: { select: { code: true } } },
      orderBy: { paidAt: 'asc' },
    }),
    prisma.rental.findMany({
      where: { decidedAt: { gte: from, lt: end }, status: { in: ['APPROVED', 'ACTIVE', 'COMPLETED'] } },
      select: { totalAmount: true },
    }),
    prisma.payment.findMany({ where: { status: { in: ['PENDING', 'OVERDUE'] } }, select: { amount: true, status: true } }),
    prisma.mpesaTransaction.findMany({ where: { status: 'SUCCESS', refundedAt: null, rental: { status: { in: ['REJECTED', 'CANCELLED'] } } }, select: { amount: true } }),
    prisma.mpesaTransaction.findMany({ where: { refundedAt: { gte: from, lt: end } }, select: { amount: true } }),
  ]);
  const amount = (p: { amount: unknown }) => Number(p.amount);

  return {
    title: 'Financial report',
    kpis: [
      { label: 'Booked (approved rentals)', value: sum(approved.map((r) => Number(r.totalAmount))), format: 'money' as const, hint: `${approved.length} rental(s)` },
      { label: 'Collected', value: sum(paid.map(amount)), format: 'money' as const, hint: `${paid.length} payment(s)` },
      { label: 'Collected by M-Pesa', value: sum(paid.filter((p) => p.method === 'MPESA').map(amount)), format: 'money' as const },
      { label: 'Outstanding today', value: sum(unpaid.map(amount)), format: 'money' as const, hint: 'pending + overdue' },
      { label: 'Overdue today', value: sum(unpaid.filter((p) => p.status === 'OVERDUE').map(amount)), format: 'money' as const },
      { label: 'Refunds to do', value: sum(refundsDue.map(amount)), format: 'money' as const, hint: `${refundsDue.length} deposit(s)` },
      { label: 'Refunded in period', value: sum(refunded.map(amount)), format: 'money' as const },
    ],
    breakdowns: [
      { title: 'Collected by payment method', format: 'money' as const, items: group(paid, (p) => PAYMENT_METHOD_LABELS[p.method ?? ''] ?? 'Not set', amount) },
      { title: 'Collected by customer', format: 'money' as const, items: group(paid, (p) => p.customer.companyName, amount).slice(0, 10) },
    ],
    table: {
      columns: [
        { key: 'date', label: 'Paid on', format: 'date' as const },
        { key: 'reference', label: 'Reference' },
        { key: 'rental', label: 'Rental' },
        { key: 'customer', label: 'Customer' },
        { key: 'method', label: 'Method' },
        { key: 'kind', label: 'Type' },
        { key: 'amount', label: 'Amount', format: 'money' as const },
      ],
      rows: paid.map((p) => ({
        date: isoDay(p.paidAt!),
        reference: p.reference,
        rental: p.rental.code,
        customer: p.customer.companyName,
        method: PAYMENT_METHOD_LABELS[p.method ?? ''] ?? '—',
        kind: p.kind === 'DEPOSIT' ? 'Deposit' : 'Balance',
        amount: amount(p),
      })),
    },
  };
}

// ── Rentals ──

async function rentals(from: Date, end: Date) {
  const list = await prisma.rental.findMany({
    where: { createdAt: { gte: from, lt: end } },
    include: { customer: { select: { companyName: true } }, equipment: { select: { code: true, name: true } } },
    orderBy: { createdAt: 'asc' },
  });
  const approved = list.filter((r) => ['APPROVED', 'ACTIVE', 'COMPLETED'].includes(r.status));
  const rejected = list.filter((r) => r.status === 'REJECTED');
  const decided = list.filter((r) => r.decidedAt);
  const avgDecision = decided.length
    ? Math.round(decided.reduce((s, r) => s + (r.decidedAt!.getTime() - r.createdAt.getTime()), 0) / decided.length / 1000)
    : 0;

  return {
    title: 'Rentals report',
    kpis: [
      { label: 'Requests', value: list.length, format: 'number' as const },
      { label: 'Approved', value: approved.length, format: 'number' as const },
      { label: 'Rejected', value: rejected.length, format: 'number' as const },
      { label: 'Approval rate', value: approved.length + rejected.length ? approved.length / (approved.length + rejected.length) : 0, format: 'percent' as const },
      { label: 'Average decision time', value: avgDecision, format: 'seconds' as const, hint: 'request → final decision' },
      { label: 'Value approved', value: sum(approved.map((r) => Number(r.totalAmount))), format: 'money' as const },
    ],
    breakdowns: [
      { title: 'Requests by status', format: 'number' as const, items: group(list, (r) => r.status) },
      { title: 'Rejections by deciding agent', format: 'number' as const, items: group(rejected, (r) => r.decidedByAgent ?? 'Workflow') },
      { title: 'Requests by equipment', format: 'number' as const, items: group(list, (r) => `${r.equipment.code} ${r.equipment.name}`).slice(0, 10) },
    ],
    table: {
      columns: [
        { key: 'created', label: 'Requested', format: 'date' as const },
        { key: 'code', label: 'Rental' },
        { key: 'customer', label: 'Customer' },
        { key: 'equipment', label: 'Equipment' },
        { key: 'start', label: 'Start', format: 'date' as const },
        { key: 'end', label: 'End', format: 'date' as const },
        { key: 'total', label: 'Total', format: 'money' as const },
        { key: 'status', label: 'Status' },
        { key: 'decidedBy', label: 'Decided by' },
        { key: 'reason', label: 'Reason' },
      ],
      rows: list.map((r) => ({
        created: isoDay(r.createdAt),
        code: r.code,
        customer: r.customer.companyName,
        equipment: `${r.equipment.code} ${r.equipment.name}`,
        start: isoDay(r.startDate),
        end: isoDay(r.endDate),
        total: Number(r.totalAmount),
        status: r.status,
        decidedBy: r.decidedByAgent ?? '',
        reason: (r.decisionReason ?? '').slice(0, 300),
      })),
    },
  };
}

// ── Fleet & maintenance ──

async function fleet(from: Date, end: Date, periodDays: number) {
  const equipment = await prisma.equipment.findMany({
    orderBy: { code: 'asc' },
    include: {
      rentals: {
        where: { status: { in: ['APPROVED', 'ACTIVE', 'COMPLETED'] }, startDate: { lt: end }, endDate: { gte: from } },
        select: { startDate: true, endDate: true, totalAmount: true },
      },
      maintenances: { where: { OR: [{ reportedAt: { gte: from, lt: end } }, { performedAt: { gte: from, lt: end } }] }, select: { type: true } },
      maintenanceOrders: { where: { createdAt: { gte: from, lt: end } }, select: { id: true } },
    },
  });

  const rows = equipment.map((e) => {
    // Days rented inside the period (inclusive day count, clipped to the period)
    const rentedDays = e.rentals.reduce((days, r) => {
      const start = Math.max(r.startDate.getTime(), from.getTime());
      const stop = Math.min(r.endDate.getTime() + DAY_MS, end.getTime());
      return days + Math.max(0, Math.round((stop - start) / DAY_MS));
    }, 0);
    return {
      code: e.code,
      name: e.name,
      status: e.status,
      rentals: e.rentals.length,
      rentedDays,
      utilization: Math.min(1, rentedDays / periodDays),
      revenue: sum(e.rentals.map((r) => Number(r.totalAmount))),
      issues: e.maintenances.filter((m) => m.type === 'ISSUE_REPORT').length,
      services: e.maintenances.filter((m) => m.type !== 'ISSUE_REPORT').length,
      workOrders: e.maintenanceOrders.length,
    };
  });

  return {
    title: 'Fleet & maintenance report',
    kpis: [
      { label: 'Machines', value: rows.length, format: 'number' as const },
      { label: 'Average utilisation', value: rows.length ? rows.reduce((s, r) => s + r.utilization, 0) / rows.length : 0, format: 'percent' as const },
      { label: 'Days rented', value: rows.reduce((s, r) => s + r.rentedDays, 0), format: 'number' as const },
      { label: 'Revenue of rentals in period', value: sum(rows.map((r) => r.revenue)), format: 'money' as const },
      { label: 'Issue reports', value: rows.reduce((s, r) => s + r.issues, 0), format: 'number' as const },
      { label: 'Work orders opened', value: rows.reduce((s, r) => s + r.workOrders, 0), format: 'number' as const },
    ],
    breakdowns: [
      { title: 'Utilisation by machine', format: 'percent' as const, items: rows.map((r) => ({ label: `${r.code} ${r.name}`, value: r.utilization })).sort((a, b) => b.value - a.value) },
      { title: 'Revenue by machine', format: 'money' as const, items: rows.map((r) => ({ label: `${r.code} ${r.name}`, value: r.revenue })).sort((a, b) => b.value - a.value) },
    ],
    table: {
      columns: [
        { key: 'code', label: 'Code' },
        { key: 'name', label: 'Equipment' },
        { key: 'status', label: 'Status now' },
        { key: 'rentals', label: 'Rentals', format: 'number' as const },
        { key: 'rentedDays', label: 'Days rented', format: 'number' as const },
        { key: 'utilization', label: 'Utilisation', format: 'percent' as const },
        { key: 'revenue', label: 'Revenue', format: 'money' as const },
        { key: 'issues', label: 'Issues', format: 'number' as const },
        { key: 'services', label: 'Services', format: 'number' as const },
        { key: 'workOrders', label: 'Work orders', format: 'number' as const },
      ],
      rows,
    },
  };
}

// ── AI agents ──

async function agents(from: Date, end: Date) {
  const runs = await prisma.agentExecution.findMany({
    where: { startedAt: { gte: from, lt: end } },
    select: { agent: true, status: true, decision: true, usedLLM: true, policyOverride: true, durationMs: true, inputTokens: true, outputTokens: true },
  });

  const byAgent = new Map<AgentName, typeof runs>();
  for (const r of runs) byAgent.set(r.agent, [...(byAgent.get(r.agent) ?? []), r]);

  const rows = [...byAgent.entries()]
    .map(([agent, list]) => {
      const timed = list.filter((r) => r.durationMs != null);
      return {
        agent,
        runs: list.length,
        aiRuns: list.filter((r) => r.usedLLM).length,
        failed: list.filter((r) => r.status === 'FAILED').length,
        approve: list.filter((r) => r.decision === 'APPROVE' || r.decision === 'PROCEED').length,
        flag: list.filter((r) => r.decision === 'ESCALATE').length,
        reject: list.filter((r) => r.decision === 'REJECT' || r.decision === 'BLOCK').length,
        overrides: list.filter((r) => r.policyOverride).length,
        avgSeconds: timed.length ? Math.round(timed.reduce((s, r) => s + r.durationMs!, 0) / timed.length / 100) / 10 : 0,
        tokens: list.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0),
      };
    })
    .sort((a, b) => b.runs - a.runs);

  return {
    title: 'AI agents report',
    kpis: [
      { label: 'Agent runs', value: runs.length, format: 'number' as const },
      { label: 'Runs using AI', value: runs.filter((r) => r.usedLLM).length, format: 'number' as const },
      { label: 'Rules overrode the AI', value: runs.filter((r) => r.policyOverride).length, format: 'number' as const, hint: 'Policy Guard' },
      { label: 'Failed runs', value: runs.filter((r) => r.status === 'FAILED').length, format: 'number' as const },
      { label: 'LLM tokens', value: runs.reduce((s, r) => s + (r.inputTokens ?? 0) + (r.outputTokens ?? 0), 0), format: 'number' as const },
    ],
    breakdowns: [
      { title: 'Runs by agent', format: 'number' as const, items: rows.map((r) => ({ label: r.agent, value: r.runs })) },
      { title: 'Decisions', format: 'number' as const, items: group(runs.filter((r) => r.decision && r.decision !== 'NONE'), (r) => r.decision!) },
    ],
    table: {
      columns: [
        { key: 'agent', label: 'Agent' },
        { key: 'runs', label: 'Runs', format: 'number' as const },
        { key: 'aiRuns', label: 'With AI', format: 'number' as const },
        { key: 'approve', label: 'Proceed / approve', format: 'number' as const },
        { key: 'flag', label: 'Flag', format: 'number' as const },
        { key: 'reject', label: 'Reject / block', format: 'number' as const },
        { key: 'overrides', label: 'Rule overrides', format: 'number' as const },
        { key: 'failed', label: 'Failed', format: 'number' as const },
        { key: 'avgSeconds', label: 'Avg time (s)', format: 'number' as const },
        { key: 'tokens', label: 'Tokens', format: 'number' as const },
      ],
      rows,
    },
  };
}
