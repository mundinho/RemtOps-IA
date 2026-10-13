import { describe, expect, it } from 'vitest';
import { approvalRules } from '../src/agents/approval/rules.js';
import { periodMentionedIn } from '../src/agents/assistant/CustomerAssistant.js';
import { neutraliseAccusations } from '../src/agents/core/languageGuard.js';
import { applyPolicyGuard } from '../src/agents/core/policyGuard.js';
import type { RuleViolation } from '../src/agents/core/types.js';
import { financeCheckRules } from '../src/agents/finance/rules.js';
import { planFleetMaintenance, type FleetItem } from '../src/agents/maintenance/monitoringRules.js';
import { maintenanceRules } from '../src/agents/maintenance/rules.js';
import { onboardingRules, type RegistrationFacts } from '../src/agents/onboarding/rules.js';
import { detectAnomalies } from '../src/agents/risk/RiskMonitor.js';
import { riskRules } from '../src/agents/risk/rules.js';

const BLOCK: RuleViolation = { rule: 'maintenance.overdue', decision: 'BLOCK', reason: 'Equipment maintenance is overdue.' };
const ESCALATE: RuleViolation = { rule: 'documents.incomplete', decision: 'ESCALATE', reason: 'Documentation incomplete.' };
const guard = (violations: RuleViolation[], judgement: Parameters<typeof applyPolicyGuard>[0]['judgement']) =>
  applyPolicyGuard({ violations, judgement, llmDecisions: ['PROCEED', 'ESCALATE'], escalateOnMissingJudgement: true });

describe('Policy Guard — the AI can restrict, never permit', () => {
  it('hard rule wins over a confident LLM that says PROCEED (and records the override)', () => {
    const result = guard([BLOCK], { decision: 'PROCEED', confidence: 0.95, reasoning: 'Looks fine' });
    expect(result.decision).toBe('BLOCK');
    expect(result.policyOverride).toBe(true);
  });

  it('LLM may make a clean case MORE restrictive', () => {
    expect(guard([], { decision: 'ESCALATE', confidence: 0.9, reasoning: 'Unclear use' }).decision).toBe('ESCALATE');
  });

  it('low confidence escalates instead of approving', () => {
    const result = guard([], { decision: 'PROCEED', confidence: 0.5, reasoning: 'Maybe' });
    expect(result.decision).toBe('ESCALATE');
    expect(result.reasons.join(' ')).toMatch(/confidence/i);
  });

  it('a decision outside the LLM allowlist is escalated, not executed', () => {
    expect(guard([], { decision: 'REJECT', confidence: 0.99, reasoning: 'Reject' }).decision).toBe('ESCALATE');
  });

  it('no valid AI answer → escalate (fail-safe, never fail-open)', () => {
    expect(guard([], null).decision).toBe('ESCALATE');
  });

  it('without AI consultation the rules decide alone', () => {
    expect(guard([ESCALATE], undefined).decision).toBe('ESCALATE');
    expect(guard([], undefined).decision).toBe('PROCEED');
  });
});

describe('Approval Agent mandate (autonomous mode)', () => {
  const available = { available: true, conflicts: [] };
  const finding = (rule: string, status = 'SUCCEEDED') => ({
    agent: 'RISK',
    status,
    decision: 'ESCALATE',
    summary: '',
    flags: [{ rule, decision: 'ESCALATE', reason: `flag ${rule}` }],
    aiAssessment: null,
    aiConfidence: null,
  });

  it('non-overridable flags are rejected by policy before the AI is asked', () => {
    const facts = { checkEquipmentAvailability: available, getCaseFindings: [finding('payments.overdue')] };
    expect(approvalRules(facts).map((v) => v.decision)).toEqual(['REJECT']);
  });

  it('overridable flags are left for the AI to weigh', () => {
    const facts = { checkEquipmentAvailability: available, getCaseFindings: [finding('documents.incomplete')] };
    expect(approvalRules(facts)).toHaveLength(0);
  });

  it('an incomplete check or a double booking blocks approval', () => {
    expect(approvalRules({ checkEquipmentAvailability: available, getCaseFindings: [finding('x', 'FAILED')] })[0]?.rule).toBe('checks.incomplete');
    const booked = { available: false, conflicts: [{ code: 'RNT-1', status: 'APPROVED', start: '', end: '' }] };
    expect(approvalRules({ checkEquipmentAvailability: booked, getCaseFindings: [] })[0]?.rule).toBe('equipment.booked_meanwhile');
  });

  it('a confident AI approval is accepted; a low-confidence one is not', () => {
    const decide = (confidence: number) =>
      applyPolicyGuard({ violations: [], judgement: { decision: 'APPROVE', confidence, reasoning: 'ok' }, llmDecisions: ['APPROVE', 'REJECT'], escalateOnMissingJudgement: true }).decision;
    expect(decide(0.9)).toBe('APPROVE');
    expect(decide(0.5)).not.toBe('APPROVE');
  });
});

describe('Customer assistant — periods are resolved by code, not by the model', () => {
  it('reads explicit dates in ISO and dd/mm/yyyy', () => {
    expect(periodMentionedIn('Disponível de 2026-11-02 a 2026-11-06?')).toEqual({ from: '2026-11-02', to: '2026-11-06' });
    expect(periodMentionedIn('from 2/11/2026 to 6/11/2026')).toEqual({ from: '2026-11-02', to: '2026-11-06' });
  });

  it('understands common Portuguese and English expressions', () => {
    const nextWeek = periodMentionedIn('Posso alugar na próxima semana?');
    expect(nextWeek).not.toBeNull();
    expect(periodMentionedIn('Is it free next week?')).toEqual(nextWeek);
    expect(periodMentionedIn('e amanhã?')?.from).toBe(periodMentionedIn('tomorrow')?.from);
    expect(periodMentionedIn('Que documentos preciso?')).toBeNull();
  });
});

describe('Language guard — anomalies, never accusations', () => {
  it('neutralises accusatory words in English and Portuguese', () => {
    const result = neutraliseAccusations('Possible fraud: the customer stole hours. Suspeita de fraude.');
    expect(result.text).not.toMatch(/fraud|stole|fraude/i);
    expect(result.replaced).toEqual(['fraud', 'stole', 'fraude']);
  });

  it('leaves neutral text untouched', () => {
    expect(neutraliseAccusations('3 late returns in the last 5 rentals.').replaced).toHaveLength(0);
  });
});

describe('Rental-flow rules', () => {
  const request = { startDate: '2026-12-01', endDate: '2026-12-07', totalAmount: 210_000, days: 7 };

  it('maintenance overdue blocks even when status says AVAILABLE', () => {
    const facts = {
      getEquipment: { status: 'AVAILABLE', maintenanceOverdue: true, nextMaintenanceDue: '2026-09-10' },
      getRentalRequest: request,
      getOpenIssues: [],
    };
    expect(maintenanceRules(facts).map((v) => v.decision)).toContain('BLOCK');
  });

  it('an AI-classified CRITICAL issue blocks; HIGH escalates', () => {
    const facts = {
      getEquipment: { status: 'AVAILABLE', maintenanceOverdue: false, nextMaintenanceDue: '2027-01-01' },
      getRentalRequest: request,
      getOpenIssues: [{ id: 'i1', severity: null, description: 'Hydraulic noise' }],
    };
    expect(maintenanceRules(facts, { i1: 'CRITICAL' })[0]?.decision).toBe('BLOCK');
    expect(maintenanceRules(facts, { i1: 'HIGH' })[0]?.decision).toBe('ESCALATE');
    expect(maintenanceRules(facts)[0]?.rule).toBe('issue.unclassified');
  });

  it('expired insurance + late returns escalate; a blocked account rejects', () => {
    const facts = {
      getCustomer: { isBlocked: false, notes: null, creditLimit: null },
      getCustomerRentalHistory: { totalRentals: 5, lateReturns: 3, totalLateDays: 17, damageIncidents: 1 },
      checkDocuments: { complete: false, expired: [{ type: 'INSURANCE_CERTIFICATE', expiredOn: '2026-09-18' }], missing: [] },
      getRentalRequest: request,
    };
    expect(riskRules(facts).map((v) => v.rule)).toEqual(['documents.incomplete', 'history.late_returns']);
    expect(riskRules({ ...facts, getCustomer: { isBlocked: true, notes: 'Unpaid', creditLimit: null } })[0]?.decision).toBe('REJECT');
  });

  it('a known NUIT typed with a different email is escalated for identity verification', () => {
    const facts = {
      getCustomer: { isBlocked: false, notes: null, creditLimit: null, email: 'joao@silva.co.mz', companyName: 'Silva' },
      getCustomerRentalHistory: { totalRentals: 12, lateReturns: 0, totalLateDays: 0, damageIncidents: 0 },
      checkDocuments: { complete: true, expired: [], missing: [] },
      getRentalRequest: { ...request, submittedContact: { name: 'Pedro', email: 'pedro@gmail.com', phone: null } },
    };
    expect(riskRules(facts).map((v) => v.rule)).toEqual(['identity.contact_mismatch']);
    const same = { ...facts, getRentalRequest: { ...request, submittedContact: { name: 'João', email: 'JOAO@silva.co.mz', phone: null } } };
    expect(riskRules(same)).toHaveLength(0);
  });

  it('cash above the cash limit needs a manager', () => {
    const facts = {
      getCustomer: { creditLimit: null },
      getRentalRequest: { ...request, totalAmount: 300_000, paymentMethod: 'CASH' },
      getCustomerPayments: { outstandingAmount: 0, overdueCount: 0, overdueAmount: 0, oldestOverdueDays: 0, unpaid: [] },
    };
    expect(financeCheckRules(facts).map((v) => v.rule)).toEqual(['payment.cash_limit']);
    expect(financeCheckRules({ ...facts, getRentalRequest: { ...request, totalAmount: 300_000, paymentMethod: 'MPESA' } })).toHaveLength(0);
  });

  it('overdue payments and credit exposure escalate to a human', () => {
    const facts = {
      getCustomer: { creditLimit: 500_000 },
      getRentalRequest: request,
      getCustomerPayments: { outstandingAmount: 400_000, overdueCount: 1, overdueAmount: 400_000, oldestOverdueDays: 30, unpaid: [] },
    };
    expect(financeCheckRules(facts).map((v) => v.rule)).toEqual(['payments.overdue', 'credit.limit_exceeded']);
  });
});

describe('Monitoring rules', () => {
  const machine = (overrides: Partial<FleetItem>): FleetItem => ({
    code: 'EQP-X',
    name: 'Machine',
    status: 'AVAILABLE',
    usageHours: 1000,
    hoursSinceService: 100,
    serviceIntervalHours: 500,
    hoursRatio: 0.2,
    nextMaintenanceDue: '2027-01-01',
    daysUntilDue: 90,
    openOrders: [],
    ...overrides,
  });

  it('over the engine-hour limit → preventive order + maintenance pending', () => {
    const [plan] = planFleetMaintenance([machine({ hoursSinceService: 510, hoursRatio: 1.02 })]);
    expect(plan?.order?.type).toBe('PREVENTIVE');
    expect(plan?.flagPending).toBe(true);
  });

  it('at 90%+ of the interval → warning only, no order', () => {
    const [plan] = planFleetMaintenance([machine({ hoursSinceService: 380, serviceIntervalHours: 400, hoursRatio: 0.95 })]);
    expect(plan?.finding.kind).toBe('SERVICE_HOURS_APPROACHING');
    expect(plan?.order).toBeUndefined();
  });

  it('machines already in the workshop are skipped', () => {
    expect(planFleetMaintenance([machine({ status: 'MAINTENANCE', hoursSinceService: 900, hoursRatio: 1.8 })])).toHaveLength(0);
  });

  it('detects late-return patterns, unreturned machines, status mismatches and impossible meter readings', () => {
    const candidates = detectAnomalies(
      [{ code: 'CUS-2', companyName: 'Obras', lastRentals: 5, lateInLastRentals: 3, lateDaysInLastRentals: 17, rentals: [{ code: 'R1', end: '2026-08-01', lateDays: 3 }] }],
      {
        overdueReturns: [{ rental: 'R9', customer: { code: 'CUS-2', companyName: 'Obras' }, equipment: { code: 'EQP-9', name: 'Plate' }, endDate: '2026-10-01', daysOverdue: 2 }],
        statusMismatches: [{ equipment: { code: 'EQP-10', name: 'Mixer' }, status: 'RENTED' }],
        implausibleUsage: [{ rental: 'R3', customer: { code: 'CUS-3', companyName: 'Norte' }, equipment: { code: 'EQP-1', name: 'Excavator' }, days: 21, hoursUsed: 600, hoursPerDay: 28.6 }],
      },
    );
    expect(candidates.map((c) => c.finding.kind)).toEqual(['LATE_RETURN_PATTERN', 'OVERDUE_RETURN', 'STATUS_INCONSISTENCY', 'USAGE_ANOMALY']);
    // Nothing the detector writes should read as an accusation
    expect(candidates.every((c) => neutraliseAccusations(`${c.finding.title} ${c.finding.detail}`).replaced.length === 0)).toBe(true);
  });
});

describe('Onboarding rules — self-registration', () => {
  const submitted: RegistrationFacts['submitted'] = {
    companyName: 'Construtora Norte, Lda',
    taxId: '400777555',
    contactName: 'Helena Cossa',
    email: 'helena@norte.co.mz',
    phone: '+258 84 555 6677',
  };
  const record = { code: 'CUS-009', companyName: 'Construtora Norte, Lda', contactName: 'Helena Cossa', email: 'helena@norte.co.mz', isBlocked: false, rentals: 2 };
  const rulesFor = (facts: Partial<RegistrationFacts>) => onboardingRules({ submitted, existingRecord: null, ...facts }).map((v) => v.rule);

  it('lets a new company through to the AI judgement', () => {
    expect(rulesFor({})).toEqual([]);
  });

  it('lets an existing company claim its account with the email on file (case-insensitive)', () => {
    expect(rulesFor({ submitted: { ...submitted, email: 'Helena@Norte.co.mz' }, existingRecord: record })).toEqual([]);
  });

  it('rejects a claim on an existing NUIT with a different email — prevents account takeover', () => {
    expect(rulesFor({ submitted: { ...submitted, email: 'someone@else.co.mz' }, existingRecord: record })).toEqual(['customer.email_mismatch']);
  });

  it('rejects blocked customers and disposable inboxes', () => {
    expect(rulesFor({ existingRecord: { ...record, isBlocked: true } })).toEqual(['customer.blocked']);
    expect(rulesFor({ submitted: { ...submitted, email: 'x@mailinator.com' } })).toEqual(['email.disposable']);
  });
});
