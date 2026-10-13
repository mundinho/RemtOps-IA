import { z } from 'zod';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { BaseAgent, type JudgementRequest, type Outcome } from '../core/BaseAgent.js';
import { fact, type IssueFact } from '../core/facts.js';
import { confidenceField, upperEnum } from '../core/schemas.js';
import type { Facts } from '../core/types.js';
import { maintenanceRules } from './rules.js';

const SEVERITY = upperEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']);

const MaintenanceJudgement = z.object({
  decision: upperEnum(['PROCEED', 'ESCALATE', 'BLOCK']),
  confidence: confidenceField,
  reasoning: z.string(),
  issues: z.array(z.object({ issueId: z.string(), severity: SEVERITY, reasoning: z.string().optional() })).default([]),
});
type MaintenanceJudgement = z.infer<typeof MaintenanceJudgement>;

/**
 * Maintenance Agent.
 * Deterministic: overdue service, out-of-service status, critical/high issues, service due mid-rental.
 * AI: overall condition assessment + severity of issues reported in free text.
 *
 * The LLM is consulted even when a rule already blocks — so the dashboard can show the
 * Policy Guard overriding a model that would have let an unsafe machine out.
 */
export class MaintenanceAgent extends BaseAgent<MaintenanceJudgement> {
  readonly name = 'MAINTENANCE' as const;
  readonly label = 'Maintenance Agent';
  readonly goal =
    'Your goal is to make sure the requested equipment is safe to rent: check its scheduled maintenance dates, maintenance history and any open reported issues.';
  protected readonly offeredTools = ['getEquipment', 'getMaintenanceHistory', 'getOpenIssues', 'getRentalRequest'] as const;
  protected readonly requiredFacts = ['getEquipment', 'getOpenIssues', 'getRentalRequest'] as const;

  protected evaluateRules(facts: Facts, judgement?: MaintenanceJudgement | null) {
    return maintenanceRules(facts, this.validClassifications(facts, judgement));
  }

  protected judgementRequest(facts: Facts): JudgementRequest<MaintenanceJudgement> {
    const equipment = fact.equipment(facts);
    const request = fact.request(facts);
    return {
      instructions:
        'Assess whether the equipment is in a safe condition to be rented for the requested period. ' +
        'Compare the next maintenance date with today and with the rental dates. ' +
        'For every open issue whose severity is null, classify it as LOW, MEDIUM, HIGH or CRITICAL from its description. ' +
        'Choose PROCEED if it is safe, ESCALATE if a technician should look at it first, BLOCK if it must not be rented.',
      fields:
        '- "decision": "PROCEED", "ESCALATE" or "BLOCK"\n' +
        '- "confidence": number between 0 and 1\n' +
        '- "reasoning": one or two sentences\n' +
        '- "issues": array of { "issueId": string, "severity": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "reasoning": string } for unclassified issues (empty if none)',
      schema: MaintenanceJudgement,
      facts: {
        equipment: {
          name: equipment.name,
          status: equipment.status,
          lastMaintenanceAt: equipment.lastMaintenanceAt,
          nextMaintenanceDue: equipment.nextMaintenanceDue,
        },
        rentalPeriod: { start: request.startDate, end: request.endDate },
        openIssues: fact.openIssues(facts).map((i) => ({ issueId: i.id, type: i.type, severity: i.severity, description: i.description })),
        recentHistory: facts.getMaintenanceHistory ?? 'not requested',
      },
    };
  }

  protected async act(outcome: Outcome<MaintenanceJudgement>, tools: ToolSession) {
    // Persist the AI's classification of previously unclassified issues
    for (const [issueId, severity] of Object.entries(this.validClassifications(outcome.facts, outcome.judgement))) {
      await tools.run('classifyIssue', { issueId, severity });
    }

    const equipment = fact.equipment(outcome.facts);
    if (outcome.decision === 'BLOCK') {
      if (equipment.status === 'AVAILABLE') {
        await tools.run('updateEquipmentStatus', { status: 'BLOCKED', reason: outcome.reasons[0] });
      }
      await tools.run('createAlert', {
        severity: 'HIGH',
        title: `${equipment.code} blocked: ${outcome.reasons[0]?.split(' (')[0] ?? 'safety check failed'}`,
        message: outcome.reasons.join(' '),
      });
    }

    if (outcome.decision === 'ESCALATE') {
      await tools.run('createAlert', {
        severity: 'MEDIUM',
        title: `${equipment.code} needs a technician check before rental`,
        message: outcome.reasons.join(' '),
      });
      await this.openCase(
        tools,
        outcome,
        'Approve only if the issue cannot affect safe operation during the rental period; otherwise reject.',
        'HIGH',
      );
    }
  }

  protected summarize(outcome: Outcome<MaintenanceJudgement>) {
    if (outcome.decision === 'PROCEED') return 'Maintenance verified — equipment within service schedule, no blocking issues';
    const verb = outcome.decision === 'BLOCK' ? 'Blocked' : 'Escalated';
    return `${verb}: ${outcome.reasons[0] ?? 'see reasoning'}`;
  }

  /** Only accept AI classifications for issues that exist on this equipment and were unclassified. */
  private validClassifications(facts: Facts, judgement?: MaintenanceJudgement | null) {
    const unclassified = new Set(fact.openIssues(facts).filter((i) => !i.severity).map((i) => i.id));
    const result: Record<string, NonNullable<IssueFact['severity']>> = {};
    for (const issue of judgement?.issues ?? []) {
      if (unclassified.has(issue.issueId)) result[issue.issueId] = issue.severity;
    }
    // Small models sometimes drop the id; with exactly one unclassified issue the mapping is unambiguous.
    if (!Object.keys(result).length && unclassified.size === 1 && judgement?.issues.length === 1) {
      result[[...unclassified][0]!] = judgement.issues[0]!.severity;
    }
    return result;
  }
}
