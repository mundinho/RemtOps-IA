import type { AgentDecision, AgentName, Prisma, Severity } from '@prisma/client';
import { finishExecution, startExecution } from '../../services/agentExecution.service.js';
import { ToolSession } from '../../tools/toolExecutor.js';
import { LlmUsage } from './llmSteps.js';

/** Something an agent noticed during a monitoring cycle. */
export interface Finding {
  agent: AgentName;
  kind: string;
  severity: Severity;
  title: string;
  detail: string;
  target: { equipmentCode?: string; customerCode?: string; rentalCode?: string };
  /** Identifies the condition, so the same situation never raises a second alert. */
  dedupeKey: string;
  /** True when this cycle raised the alert; false when it was already known. */
  isNew: boolean;
}

export interface MonitoringContext {
  cycleId: string;
  trigger: string;
  /** Findings of the agents that ran earlier in this cycle — how agents pass information on. */
  findings: readonly Finding[];
}

export interface MonitoringReport {
  findings: Finding[];
  summary: string;
  reasoning?: string;
  decision?: AgentDecision;
  output?: Prisma.InputJsonValue;
}

export const SEVERITY_RANK: Record<Severity, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

/**
 * Base for the proactive side of an agent: no request triggers it — the monitoring cycle does.
 * The agent scans the fleet/customers/payments through tools, applies its rules (and AI where
 * text needs interpreting), acts through write tools, and reports what it found.
 * Each run is one AgentExecution with all its tool calls, exactly like a workflow step.
 */
export abstract class MonitoringAgent {
  abstract readonly name: AgentName;
  abstract readonly label: string;

  protected abstract monitor(tools: ToolSession, usage: LlmUsage, ctx: MonitoringContext): Promise<MonitoringReport>;

  async run(ctx: MonitoringContext): Promise<{ executionId: string; findings: Finding[]; summary: string }> {
    const execution = await startExecution({
      agent: this.name,
      correlationId: ctx.cycleId,
      trigger: ctx.trigger,
      input: { mode: 'monitoring', cycleId: ctx.cycleId, findingsSoFar: ctx.findings.length },
    });
    const tools = new ToolSession(this.name, execution.id, { correlationId: ctx.cycleId });
    const usage = new LlmUsage();

    try {
      const report = await this.monitor(tools, usage, ctx);
      await finishExecution(execution.id, execution.startedAt, {
        status: 'SUCCEEDED',
        decision: report.decision ?? (report.findings.some((f) => f.isNew) ? 'ESCALATE' : 'NONE'),
        summary: report.summary,
        reasoning: report.reasoning,
        output: report.output ?? (JSON.parse(JSON.stringify({ findings: report.findings })) as Prisma.InputJsonValue),
        usedLLM: usage.used,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
      });
      return { executionId: execution.id, findings: report.findings, summary: report.summary };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await finishExecution(execution.id, execution.startedAt, {
        status: 'FAILED',
        decision: 'NONE',
        summary: `Monitoring failed: ${error}`,
        error,
        usedLLM: usage.used,
        model: usage.model,
      });
      return { executionId: execution.id, findings: [], summary: `Monitoring failed: ${error}` };
    }
  }

  /** Raises the alert for a finding (deduplicated) and returns it with `isNew` set. */
  protected async raise(tools: ToolSession, finding: Omit<Finding, 'agent' | 'isNew'>): Promise<Finding> {
    const alert = (await tools.run('createAlert', {
      severity: finding.severity,
      title: finding.title,
      message: finding.detail,
      ...finding.target,
      dedupeKey: finding.dedupeKey,
    })) as { created: boolean };
    return { ...finding, agent: this.name, isNew: alert.created };
  }
}

export function countSummary(findings: Finding[], noun: string, plural = `${noun}s`): string {
  const fresh = findings.filter((f) => f.isNew).length;
  if (!findings.length) return `No ${plural} found`;
  return `${findings.length} ${findings.length > 1 ? plural : noun} (${fresh} new)`;
}
