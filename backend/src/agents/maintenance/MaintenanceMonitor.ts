import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/businessRules.js';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { judgeWithLLM, type LlmUsage } from '../core/llmSteps.js';
import { countSummary, MonitoringAgent, type Finding, type MonitoringReport } from '../core/MonitoringAgent.js';
import { confidenceField } from '../core/schemas.js';
import { planFleetMaintenance, type FleetItem } from './monitoringRules.js';

const RecurrenceJudgement = z.object({
  recurring: z.preprocess((v) => (typeof v === 'string' ? v.toLowerCase() === 'true' : v), z.boolean()),
  component: z.string().default('unknown'),
  confidence: confidenceField,
  reasoning: z.string(),
  recommendation: z.string().default('Inspect the machine.'),
});

interface IssueGroup {
  equipment: { code: string; name: string };
  reports: { date: string | null; status: string; description: string }[];
}

/**
 * Maintenance Agent — monitoring mode.
 * Deterministic: engine-hour limits and service dates → work orders, 'maintenance pending', alerts.
 * AI: reads free-text issue reports of the same machine and decides whether they describe the
 * SAME recurring problem (worded differently each time) — then recommends an inspection.
 */
export class MaintenanceMonitor extends MonitoringAgent {
  readonly name = 'MAINTENANCE' as const;
  readonly label = 'Maintenance Agent';

  protected async monitor(tools: ToolSession, usage: LlmUsage): Promise<MonitoringReport> {
    const findings: Finding[] = [];
    const notes: string[] = [];

    // 1. Engine hours and service dates (rules)
    const fleet = (await tools.run('getFleetMaintenanceStatus', {}, 'POLICY')) as FleetItem[];
    for (const plan of planFleetMaintenance(fleet)) {
      if (plan.order) {
        await tools.run('createMaintenanceOrder', { equipmentCode: plan.finding.target.equipmentCode, ...plan.order });
      }
      if (plan.flagPending) {
        await tools.run('flagEquipmentForMaintenance', { equipmentCode: plan.finding.target.equipmentCode, reason: plan.finding.detail });
      }
      findings.push(await this.raise(tools, plan.finding));
    }

    // 2. Recurring problems (AI reads the free text)
    const groups = (await tools.run('getRecentIssueReports', {}, 'POLICY')) as IssueGroup[];
    for (const group of groups) {
      const judgement = await judgeWithLLM({
        agent: this.name,
        label: this.label,
        instructions:
          'You receive the recent problem reports of ONE machine, possibly written in Portuguese and worded differently. ' +
          'Decide whether they describe the SAME recurring problem (same system or component). ' +
          'If they do, name the component and recommend what a technician should inspect.',
        fields:
          '- "recurring": true or false\n' +
          '- "component": short name of the affected system (e.g. "hydraulic system")\n' +
          '- "confidence": number between 0 and 1\n' +
          '- "reasoning": one or two sentences\n' +
          '- "recommendation": what to inspect',
        facts: group,
        schema: RecurrenceJudgement,
        usage,
      }).catch(() => null);

      const code = group.equipment.code;
      if (judgement?.recurring && judgement.confidence >= BUSINESS_RULES.minLlmConfidence) {
        const reason = `${group.reports.length} reports in ${BUSINESS_RULES.monitoring.recurringIssueWindowDays} days point to the same problem (${judgement.component}). ${judgement.reasoning}`;
        await tools.run('createMaintenanceOrder', {
          equipmentCode: code,
          type: 'INSPECTION',
          priority: 'MEDIUM',
          reason: `${reason} Recommended: ${judgement.recommendation}`,
          dueInDays: 5,
        });
        findings.push(
          await this.raise(tools, {
            kind: 'RECURRING_ISSUE',
            severity: 'MEDIUM',
            title: `${code} recurring problem: ${judgement.component} — inspection recommended`,
            detail: `${reason} Recommended: ${judgement.recommendation}`,
            target: { equipmentCode: code },
            dedupeKey: `maint:recurring:${code}:${group.reports.length}`,
          }),
        );
        notes.push(`${code}: AI found a recurring ${judgement.component} problem (confidence ${Math.round(judgement.confidence * 100)}%).`);
      } else if (!judgement && group.reports.length >= 3) {
        // AI unavailable: still surface the volume of reports, without claiming a pattern.
        findings.push(
          await this.raise(tools, {
            kind: 'MULTIPLE_REPORTS',
            severity: 'LOW',
            title: `${code} has ${group.reports.length} recent problem reports`,
            detail: 'Automatic recurrence analysis was unavailable — a technician should check for a common cause.',
            target: { equipmentCode: code },
            dedupeKey: `maint:reports:${code}:${group.reports.length}`,
          }),
        );
      } else if (judgement) {
        notes.push(`${code}: AI found no common cause across ${group.reports.length} reports (${judgement.reasoning}).`);
      }
    }

    return { findings, summary: `Fleet check: ${countSummary(findings, 'finding')}`, reasoning: notes.join('\n') || undefined };
  }
}
