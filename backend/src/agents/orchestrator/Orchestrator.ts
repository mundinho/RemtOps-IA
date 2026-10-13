import type { AgentName, WorkflowStep } from '@prisma/client';
import { eventBus } from '../../events/eventBus.js';
import { finishExecution, startExecution } from '../../services/agentExecution.service.js';
import { listPendingRegistrations } from '../../services/auth.service.js';
import { getRentalScope, listUnfinishedWorkflows, updateWorkflowState } from '../../services/rental.service.js';
import { AnomalyTriageMonitor } from '../approval/AnomalyTriageMonitor.js';
import { ApprovalAgent } from '../approval/ApprovalAgent.js';
import type { Finding } from '../core/MonitoringAgent.js';
import type { AgentContext, AgentResult } from '../core/types.js';
import { FinanceBillingAgent, FinanceCheckAgent } from '../finance/FinanceAgent.js';
import { FinanceMonitor } from '../finance/FinanceMonitor.js';
import { MaintenanceAgent } from '../maintenance/MaintenanceAgent.js';
import { MaintenanceMonitor } from '../maintenance/MaintenanceMonitor.js';
import { NotificationAgent } from '../notification/NotificationAgent.js';
import { NotificationMonitor } from '../notification/NotificationMonitor.js';
import { onboardingAgent } from '../onboarding/OnboardingAgent.js';
import { RentalIntakeAgent } from '../rental/RentalAgent.js';
import { RiskAgent } from '../risk/RiskAgent.js';
import { RiskMonitor } from '../risk/RiskMonitor.js';
import { isAgentStep, TRANSITIONS, type AgentStep } from './workflow.js';

const ORCHESTRATOR = { type: 'AGENT', id: 'ORCHESTRATOR' } as const;

/** All the Orchestrator needs to know about an agent. */
interface Agent {
  readonly name: AgentName;
  run(ctx: AgentContext): Promise<AgentResult>;
}

/**
 * The Orchestrator owns the PROCESS, not the decisions. It runs fully autonomously —
 * no step waits for a person; people only observe through the dashboard.
 *
 *   1. Rental workflows (reactive) — triggered by a QR request:
 *      run the agent for each step, map its decision to the next step (workflow.ts), apply
 *      audited status changes. Flags travel with the request; the Approval Agent decides.
 *
 *   2. Monitoring cycles (proactive) — triggered by the scheduler or the dashboard:
 *      Maintenance → Finance → Risk scan the operation, the Approval Agent triages the anomalies,
 *      then the Notification Agent informs customers and operations of what was found.
 *
 * Why it exists: specialist agents stay small and unaware of each other. Adding a step or a new
 * agent (Finance, then Approval) was a change here and in the transition table — not in the agents.
 */
export class Orchestrator {
  private readonly agents: Record<AgentStep, Agent> = {
    INTAKE: new RentalIntakeAgent(),
    MAINTENANCE_CHECK: new MaintenanceAgent(),
    RISK_ASSESSMENT: new RiskAgent(),
    FINANCE_CHECK: new FinanceCheckAgent(),
    FINALIZE: new ApprovalAgent(),
    BILLING: new FinanceBillingAgent(),
    NOTIFY: new NotificationAgent(),
  };

  /** Order matters: triage after Risk opens anomaly cases; Notification last, to report on everything. */
  private readonly monitors = [new MaintenanceMonitor(), new FinanceMonitor(), new RiskMonitor(), new AnomalyTriageMonitor()];
  private readonly notifier = new NotificationMonitor();

  /** Rentals currently being driven — prevents two runs of the same workflow. */
  private readonly running = new Set<string>();
  private monitoringInProgress = false;

  register() {
    eventBus.on('rental.requested', ({ rentalId }) => this.process(rentalId, 'rental.requested'));
    eventBus.on('monitoring.tick', async ({ trigger }) => {
      await this.runMonitoringCycle(trigger);
    });
    eventBus.on('customer.registered', async ({ customerId, facts }) => {
      await onboardingAgent.run(customerId, facts);
    });
  }

  async resumeInterrupted() {
    for (const { id } of await listUnfinishedWorkflows()) {
      await this.process(id, 'system.resume');
    }
    for (const { customerId, facts } of await listPendingRegistrations()) {
      await onboardingAgent.run(customerId, facts, 'system.resume');
    }
  }

  // ─────────────────────────── Rental workflows ───────────────────────────

  async process(rentalId: string, trigger: string): Promise<void> {
    if (this.running.has(rentalId)) return;
    this.running.add(rentalId);
    try {
      await this.drive(rentalId, trigger);
    } catch (error) {
      console.error(`[orchestrator] workflow ${rentalId} failed:`, error);
    } finally {
      this.running.delete(rentalId);
    }
  }

  private async drive(rentalId: string, trigger: string) {
    const rental = await getRentalScope(rentalId);
    let step: WorkflowStep = rental.workflowStep;

    if (rental.status === 'REQUESTED') {
      await updateWorkflowState(rentalId, { status: 'IN_REVIEW' }, ORCHESTRATOR);
      await this.log(rentalId, trigger, step, `Workflow started for ${rental.code} — routing to Rental Agent`);
    }

    while (isAgentStep(step)) {
      const agent = this.agents[step];
      const result = await agent.run({ rentalId, rentalCode: rental.code, step, trigger });
      // An unexpected outcome never lets a request through: it ends the flow as a rejection.
      const expected = TRANSITIONS[step][result.decision];
      const next: WorkflowStep = expected ?? (step === 'NOTIFY' ? 'DONE' : 'NOTIFY');
      await this.applyOutcome(rentalId, step, agent.name, result, next, !expected);

      if (next !== step && next !== 'DONE') {
        const flagged = result.decision === 'ESCALATE' && expected ? `Flag raised by ${agent.name.toLowerCase()} — continuing. ` : '';
        await this.log(rentalId, trigger, next, `${flagged}${routingMessage(next)}`);
      }
      step = next;
    }

    if (step === 'DONE') {
      const final = await getRentalScope(rentalId);
      await this.log(rentalId, trigger, 'DONE', `Workflow completed for ${rental.code} — ${final.status.toLowerCase()}`);
    }
  }

  private async applyOutcome(
    rentalId: string,
    step: AgentStep,
    agent: AgentName,
    result: AgentResult,
    next: WorkflowStep,
    unexpected: boolean,
  ) {
    const reason = result.reasons.join(' ') || result.summary;
    // Billing runs after approval: its failure must not undo an approved rental.
    const rejects = result.decision === 'REJECT' || result.decision === 'BLOCK' || (unexpected && step !== 'BILLING' && step !== 'NOTIFY');

    if (rejects) {
      await updateWorkflowState(
        rentalId,
        { status: 'REJECTED', workflowStep: next, decisionReason: reason, decidedByAgent: agent, decidedAt: new Date() },
        ORCHESTRATOR,
      );
    } else {
      // APPROVE already set the status through the confirmRental tool; here only the step moves.
      await updateWorkflowState(rentalId, { workflowStep: next }, ORCHESTRATOR);
    }
  }

  // ─────────────────────────── Monitoring cycles ───────────────────────────

  async runMonitoringCycle(trigger: string): Promise<{ cycleId: string; findings: number } | null> {
    if (this.monitoringInProgress) return null;
    this.monitoringInProgress = true;
    const cycleId = `MON-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14)}`;

    try {
      await this.logCycle(cycleId, trigger, `Monitoring cycle ${cycleId} started — Maintenance → Finance → Risk → Approval → Notification`);
      const findings: Finding[] = [];
      for (const monitor of this.monitors) {
        const result = await monitor.run({ cycleId, trigger, findings });
        findings.push(...result.findings);
      }
      await this.notifier.run({ cycleId, trigger, findings });

      const fresh = findings.filter((f) => f.isNew).length;
      await this.logCycle(cycleId, trigger, `Monitoring cycle completed — ${findings.length} finding(s), ${fresh} new`);
      return { cycleId, findings: findings.length };
    } catch (error) {
      console.error(`[orchestrator] monitoring cycle ${cycleId} failed:`, error);
      return null;
    } finally {
      this.monitoringInProgress = false;
    }
  }

  get isMonitoring() {
    return this.monitoringInProgress;
  }

  // ─────────────────────────── Activity feed entries ───────────────────────────

  /** The Orchestrator's own entries in the activity feed (routing decisions, no LLM). */
  private async log(rentalId: string, trigger: string, step: WorkflowStep, summary: string) {
    const execution = await startExecution({ agent: 'ORCHESTRATOR', correlationId: rentalId, rentalId, step, trigger });
    await finishExecution(execution.id, execution.startedAt, { status: 'SUCCEEDED', decision: 'NONE', summary, usedLLM: false });
  }

  private async logCycle(cycleId: string, trigger: string, summary: string) {
    const execution = await startExecution({ agent: 'ORCHESTRATOR', correlationId: cycleId, trigger });
    await finishExecution(execution.id, execution.startedAt, { status: 'SUCCEEDED', decision: 'NONE', summary, usedLLM: false });
  }
}

function routingMessage(next: WorkflowStep): string {
  const target: Partial<Record<WorkflowStep, string>> = {
    MAINTENANCE_CHECK: 'Maintenance Agent',
    RISK_ASSESSMENT: 'Risk & Compliance Agent',
    FINANCE_CHECK: 'Finance Agent for the payment check',
    FINALIZE: 'Approval Agent for the final AI decision',
    BILLING: 'Finance Agent to register the payment',
    NOTIFY: 'Notification Agent',
  };
  return `Routing to ${target[next] ?? next}`;
}

export const orchestrator = new Orchestrator();
