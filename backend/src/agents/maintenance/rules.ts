import { fact, type IssueFact } from '../core/facts.js';
import type { Facts, RuleViolation } from '../core/types.js';

/**
 * Deterministic safety rules. `classified` holds severities assigned by the AI to issues
 * that had none — the AI interprets the free text, but the rule decides what a severity means.
 */
export function maintenanceRules(facts: Facts, classified: Record<string, IssueFact['severity']> = {}): RuleViolation[] {
  const violations: RuleViolation[] = [];
  const equipment = fact.equipment(facts);
  const request = fact.request(facts);

  if (equipment.maintenanceOverdue) {
    violations.push({
      rule: 'maintenance.overdue',
      decision: 'BLOCK',
      reason: `Equipment maintenance is overdue (scheduled service was due on ${equipment.nextMaintenanceDue}).`,
    });
  }

  if (equipment.status === 'MAINTENANCE' || equipment.status === 'BLOCKED') {
    violations.push({
      rule: 'equipment.out_of_service',
      decision: 'BLOCK',
      reason: `Equipment is currently out of service (status: ${equipment.status.toLowerCase()}).`,
    });
  }

  for (const issue of fact.openIssues(facts)) {
    const severity = issue.severity ?? classified[issue.id] ?? null;
    const source = issue.severity ? '' : ' (severity assessed by AI)';
    if (severity === 'CRITICAL') {
      violations.push({ rule: 'issue.critical', decision: 'BLOCK', reason: `Critical open issue${source}: ${issue.description}` });
    } else if (severity === 'HIGH') {
      violations.push({ rule: 'issue.high', decision: 'ESCALATE', reason: `High-severity open issue${source}: ${issue.description}` });
    } else if (severity === null) {
      violations.push({
        rule: 'issue.unclassified',
        decision: 'ESCALATE',
        reason: `Reported issue could not be classified: ${issue.description}`,
      });
    }
  }

  if (
    !equipment.maintenanceOverdue &&
    equipment.nextMaintenanceDue &&
    equipment.nextMaintenanceDue >= request.startDate &&
    equipment.nextMaintenanceDue <= request.endDate
  ) {
    violations.push({
      rule: 'maintenance.due_during_rental',
      decision: 'ESCALATE',
      reason: `Scheduled service (${equipment.nextMaintenanceDue}) falls within the rental period.`,
    });
  }

  return violations;
}
