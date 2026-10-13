import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/businessRules.js';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { neutraliseAccusations } from '../core/languageGuard.js';
import { judgeWithLLM, type LlmUsage } from '../core/llmSteps.js';
import { countSummary, MonitoringAgent, type Finding, type MonitoringReport } from '../core/MonitoringAgent.js';

interface ReturnPattern {
  code: string;
  companyName: string;
  lastRentals: number;
  lateInLastRentals: number;
  lateDaysInLastRentals: number;
  rentals: { code: string; end: string; lateDays: number }[];
}

interface Consistency {
  overdueReturns: { rental: string; customer: { code: string; companyName: string }; equipment: { code: string; name: string }; endDate: string; daysOverdue: number }[];
  statusMismatches: { equipment: { code: string; name: string }; status: string }[];
  implausibleUsage: { rental: string; customer: { code: string; companyName: string }; equipment: { code: string; name: string }; days: number; hoursUsed: number; hoursPerDay: number }[];
}

/** A detected anomaly, to be triaged by the Approval Agent. */
interface Candidate {
  id: string;
  finding: Omit<Finding, 'agent' | 'isNew'>;
  facts: Record<string, unknown>;
  needsReview: boolean;
  defaultAction: string;
}

const Explanations = z.object({
  items: z
    .array(z.object({ id: z.string(), explanation: z.string(), recommendedAction: z.string() }))
    .default([]),
});

/**
 * Risk Agent — monitoring mode.
 * Deterministic: DETECTS anomalies (late-return pattern, unreturned machines, status that
 * contradicts the rentals, impossible engine-hour readings).
 * AI: EXPLAINS each anomaly in neutral language and suggests what a reviewer should check.
 * Guardrail: the agent never accuses — any accusatory wording is neutralised and recorded.
 */
export class RiskMonitor extends MonitoringAgent {
  readonly name = 'RISK' as const;
  readonly label = 'Risk & Compliance Agent';

  protected async monitor(tools: ToolSession, usage: LlmUsage): Promise<MonitoringReport> {
    const patterns = (await tools.run('getCustomerReturnPatterns', {}, 'POLICY')) as ReturnPattern[];
    const consistency = (await tools.run('getOperationalConsistency', {}, 'POLICY')) as Consistency;
    const candidates = detectAnomalies(patterns, consistency);

    // AI writes the explanations (one call for all anomalies); templates if it fails.
    const notes: string[] = [];
    const explained = candidates.length
      ? await judgeWithLLM({
          agent: this.name,
          label: this.label,
          instructions:
            'For each anomaly below, write a short neutral explanation of what the data shows and what a reviewer should check. ' +
            'Describe behaviour and data only. NEVER accuse anyone of fraud, theft or wrongdoing — call it an anomaly that needs review.',
          fields: '- "items": array of { "id": string (copy it), "explanation": string, "recommendedAction": string }',
          facts: candidates.map((c) => ({ id: c.id, anomaly: c.finding.title, data: c.facts })),
          schema: Explanations,
          usage,
        }).catch(() => null)
      : null;

    const findings: Finding[] = [];
    for (const c of candidates) {
      const ai = explained?.items.find((i) => i.id === c.id);
      const explanation = neutraliseAccusations(ai?.explanation ?? c.finding.detail);
      const action = neutraliseAccusations(ai?.recommendedAction ?? c.defaultAction);
      const replaced = [...explanation.replaced, ...action.replaced];
      if (replaced.length) notes.push(`Language guard neutralised "${replaced.join('", "')}" in the explanation of ${c.id}.`);

      const finding = await this.raise(tools, { ...c.finding, detail: explanation.text });
      findings.push(finding);

      if (c.needsReview) {
        await tools.run('openAnomalyCase', {
          reason: `${c.finding.title}. ${explanation.text}`,
          recommendedAction: action.text,
          priority: c.finding.severity,
          analyzedData: c.facts,
          ...c.finding.target,
          dedupeKey: `review:${c.finding.dedupeKey}`,
        });
      }
    }
    if (candidates.length && !explained) notes.push('AI explanations unavailable — template texts used.');

    return { findings, summary: `Anomaly scan: ${countSummary(findings, 'anomaly', 'anomalies')}`, reasoning: notes.join('\n') || undefined };
  }
}

/** Pure detection rules — no AI. */
export function detectAnomalies(patterns: ReturnPattern[], consistency: Consistency): Candidate[] {
  const { lateCount, window } = BUSINESS_RULES.monitoring.lateReturnPattern;
  const candidates: Candidate[] = [];

  for (const p of patterns.filter((p) => p.lateInLastRentals >= lateCount)) {
    candidates.push({
      id: `late-${p.code}`,
      finding: {
        kind: 'LATE_RETURN_PATTERN',
        severity: 'MEDIUM',
        title: `${p.companyName}: ${p.lateInLastRentals} late returns in the last ${Math.min(window, p.lastRentals)} rentals`,
        detail: `${p.lateInLastRentals} of the last ${p.lastRentals} rentals were returned late (${p.lateDaysInLastRentals} days in total). Flagged for review.`,
        target: { customerCode: p.code },
        dedupeKey: `risk:late:${p.code}:${p.rentals[0]?.code ?? 'none'}`,
      },
      facts: { customer: p.companyName, lastRentals: p.rentals },
      needsReview: true,
      defaultAction: 'Review the customer’s recent returns and consider a deposit or shorter rental periods.',
    });
  }

  for (const r of consistency.overdueReturns) {
    candidates.push({
      id: `return-${r.rental}`,
      finding: {
        kind: 'OVERDUE_RETURN',
        severity: 'HIGH',
        title: `${r.equipment.code} not returned — rental ${r.rental} ended ${r.daysOverdue} days ago`,
        detail: `${r.equipment.name} rented by ${r.customer.companyName} should have been returned on ${r.endDate}.`,
        target: { rentalCode: r.rental, customerCode: r.customer.code, equipmentCode: r.equipment.code },
        dedupeKey: `risk:overdue-return:${r.rental}`,
      },
      facts: r,
      needsReview: false,
      defaultAction: 'Contact the customer to arrange the return or an extension.',
    });
  }

  for (const m of consistency.statusMismatches) {
    candidates.push({
      id: `status-${m.equipment.code}`,
      finding: {
        kind: 'STATUS_INCONSISTENCY',
        severity: 'MEDIUM',
        title: `${m.equipment.code} marked ${m.status.toLowerCase()} but has no active rental`,
        detail: `${m.equipment.name} is recorded as ${m.status.toLowerCase()}, yet no approved or active rental covers it.`,
        target: { equipmentCode: m.equipment.code },
        dedupeKey: `risk:status:${m.equipment.code}:${m.status}`,
      },
      facts: m,
      needsReview: true,
      defaultAction: 'Confirm where the machine is and correct its status or the missing rental record.',
    });
  }

  for (const u of consistency.implausibleUsage) {
    candidates.push({
      id: `usage-${u.rental}`,
      finding: {
        kind: 'USAGE_ANOMALY',
        severity: 'MEDIUM',
        title: `${u.equipment.code}: ${u.hoursPerDay} engine hours/day recorded during ${u.rental}`,
        detail: `${u.hoursUsed} h over ${u.days} days is above the ${BUSINESS_RULES.monitoring.maxPlausibleHoursPerDay} h/day physical maximum — a meter or recording problem, or usage outside the agreed terms.`,
        target: { equipmentCode: u.equipment.code, rentalCode: u.rental, customerCode: u.customer.code },
        dedupeKey: `risk:usage:${u.rental}`,
      },
      facts: u,
      needsReview: true,
      defaultAction: 'Check the hour meter of the machine and the readings recorded at handover and return.',
    });
  }

  return candidates;
}
