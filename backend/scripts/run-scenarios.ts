/**
 * Runs the demo scenarios end-to-end through the real Orchestrator, agents, tools and database.
 *
 *   npx tsx scripts/run-scenarios.ts             # uses LLM_PROVIDER from .env
 *   $env:LLM_PROVIDER="mock"; npx tsx scripts/run-scenarios.ts
 *
 * Re-seeds the database first (pass --no-reset to keep current data).
 * Stop the API server while running this, so two orchestrators don't process the same requests.
 */
import { orchestrator } from '../src/agents/orchestrator/Orchestrator.js';
import { prisma } from '../src/database/prisma.js';
import { seedDatabase } from '../src/database/seed.js';
import { llm } from '../src/llm/index.js';
import type { RentalRequestInput } from '../src/models/schemas.js';
import { createRentalRequest } from '../src/services/rental.service.js';
import { daysFromNow } from '../src/utils/dates.js';

interface Scenario {
  name: string;
  equipment: string;
  /** Seeded customer whose details are typed into the QR form. */
  customer: string;
  /** Several values = the AI decides (any final decision is valid, but never "waiting for a human"). */
  expected: string | string[];
  intendedUse: string;
  startIn?: number;
  days?: number;
  /** Override what is typed in the form (new customer, different email, cash...). */
  form?: Partial<RentalRequestInput>;
}

const AI_DECIDES = ['APPROVED', 'REJECTED'];

const SCENARIOS: Scenario[] = [
  { name: '1. Approved', equipment: 'EQP-001', customer: 'CUS-001', expected: 'APPROVED', intendedUse: 'Foundation excavation for a 3-storey residential building.' },
  { name: '2. Maintenance overdue', equipment: 'EQP-002', customer: 'CUS-001', expected: 'REJECTED', intendedUse: 'Land clearing and levelling for a new access road.' },
  { name: '3. Expired insurance + late returns + unpaid invoice (policy-locked)', equipment: 'EQP-003', customer: 'CUS-002', expected: 'REJECTED', intendedUse: 'Temporary power for a small construction site.' },
  { name: '4. Already rented', equipment: 'EQP-004', customer: 'CUS-001', expected: 'REJECTED', intendedUse: 'Lifting steel beams for a warehouse roof.' },
  { name: '5. Overdue payment (policy-locked)', equipment: 'EQP-003', customer: 'CUS-003', expected: 'REJECTED', intendedUse: 'Backup power for a site office.', startIn: 12 },
  {
    name: '6. New customer, no documents (AI decides)',
    equipment: 'EQP-003',
    customer: 'CUS-001',
    expected: AI_DECIDES,
    intendedUse: 'Power supply for concrete mixers on a small residential site.',
    startIn: 20,
    form: { companyName: 'Construtora Limpopo, Lda', taxId: '400999111', contactName: 'Ana Sitoe', email: 'ana@limpopo.co.mz' },
  },
  {
    name: '7. Known NUIT, different email (policy-locked)',
    equipment: 'EQP-001',
    customer: 'CUS-001',
    expected: 'REJECTED',
    intendedUse: 'Trench digging for water pipes.',
    startIn: 15,
    form: { contactName: 'Pedro', email: 'pedro.compras@gmail.com' },
  },
  { name: '8. Cash above limit (AI decides)', equipment: 'EQP-001', customer: 'CUS-001', expected: AI_DECIDES, intendedUse: 'Excavation for a warehouse foundation.', startIn: 25, days: 10, form: { paymentMethod: 'CASH' } },
];

console.log(`LLM: ${llm.name} (${llm.model})\n`);
if (!process.argv.includes('--no-reset')) await seedDatabase(prisma);

let failures = 0;
for (const s of SCENARIOS) {
  const started = Date.now();
  // Fill the QR form with the customer's registered details (as a returning customer would)
  const customer = await prisma.customer.findUniqueOrThrow({ where: { code: s.customer } });
  const request = await createRentalRequest(s.equipment, {
    companyName: customer.companyName,
    taxId: customer.taxId,
    contactName: customer.contactName,
    email: customer.email,
    phone: customer.phone ?? '+258 84 000 0000',
    paymentMethod: 'MPESA',
    startDate: daysFromNow(s.startIn ?? 3),
    endDate: daysFromNow((s.startIn ?? 3) + (s.days ?? 7) - 1),
    intendedUse: s.intendedUse,
    ...s.form,
  });
  await orchestrator.process(request.id, 'scenario-script');

  const rental = await prisma.rental.findUniqueOrThrow({ where: { id: request.id } });
  const executions = await prisma.agentExecution.findMany({
    where: { rentalId: request.id },
    orderBy: { startedAt: 'asc' },
    include: { _count: { select: { toolCalls: true } } },
  });
  const ok = (Array.isArray(s.expected) ? s.expected : [s.expected]).includes(rental.status);
  if (!ok) failures++;

  console.log(`${ok ? 'PASS' : 'FAIL'}  ${s.name}  →  ${rental.status}  (${((Date.now() - started) / 1000).toFixed(1)}s)`);
  console.log(`      reason: ${rental.decisionReason}`);
  for (const e of executions) {
    const flags = [e.usedLLM ? `llm` : 'rules', e.policyOverride ? 'POLICY OVERRIDE' : null, `${e._count.toolCalls} tools`]
      .filter(Boolean)
      .join(', ');
    console.log(`      - ${e.agent.padEnd(12)} ${String(e.decision).padEnd(8)} ${e.summary}  [${flags}]`);
  }
  console.log();
}

// Proactive monitoring: no request — the agents scan the operation on their own.
console.log('MONITORING CYCLE');
const cycleStarted = Date.now();
const cycle = await orchestrator.runMonitoringCycle('scenario-script');
const runs = await prisma.agentExecution.findMany({
  where: { correlationId: cycle?.cycleId },
  orderBy: { startedAt: 'asc' },
  include: { _count: { select: { toolCalls: true } } },
});
for (const e of runs) {
  console.log(`      - ${e.agent.padEnd(12)} ${e.summary}  [${e.usedLLM ? 'llm' : 'rules'}, ${e._count.toolCalls} tools]`);
  if (e.reasoning) console.log(`        ${e.reasoning.replace(/\n/g, '\n        ')}`);
}
const [alerts, orders, reviews, notifications] = await Promise.all([
  prisma.alert.findMany({ orderBy: [{ severity: 'desc' }], select: { severity: true, category: true, title: true } }),
  prisma.maintenanceOrder.findMany({ select: { code: true, type: true, priority: true, equipment: { select: { code: true } } } }),
  prisma.humanReview.findMany({ where: { kind: 'ANOMALY' }, select: { status: true, resolvedByAgent: true } }),
  prisma.notification.count({ where: { createdAt: { gte: new Date(cycleStarted) } } }),
]);
console.log(`\n      Alerts (${alerts.length}):`);
for (const a of alerts) console.log(`        [${a.severity.padEnd(8)}] ${a.category.padEnd(11)} ${a.title}`);
console.log(`      Maintenance orders: ${orders.map((o) => `${o.code} ${o.equipment.code} ${o.type}/${o.priority}`).join(' · ')}`);
const triaged = reviews.filter((r) => r.resolvedByAgent);
console.log(
  `      Anomaly cases: ${reviews.length} (${triaged.length} triaged by AI: ${triaged.filter((r) => r.status === 'APPROVED').length} follow-up, ${triaged.filter((r) => r.status === 'REJECTED').length} dismissed) · notifications this cycle: ${notifications}`,
);
const pending = await prisma.humanReview.count({ where: { status: 'PENDING' } });
console.log(`      Cases left waiting for a person: ${pending}`);
if (pending) failures++;
console.log(`      (${((Date.now() - cycleStarted) / 1000).toFixed(1)}s)\n`);

console.log(failures ? `${failures} scenario(s) did not match the expected outcome.` : 'All scenarios matched.');
await prisma.$disconnect();
process.exit(failures ? 1 : 0);
