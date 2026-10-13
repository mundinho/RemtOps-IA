import type { AgentName, Severity } from '@prisma/client';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { isoDay } from '../../utils/dates.js';
import { MonitoringAgent, SEVERITY_RANK, type Finding, type MonitoringContext, type MonitoringReport } from '../core/MonitoringAgent.js';

interface ReturnRow {
  rentalId: string;
  rental: string;
  customer: { code: string; companyName: string; contactName: string };
  equipment: { code: string; name: string };
  endDate: string;
  daysUntilEnd: number;
}

type NotificationType = 'MAINTENANCE_DUE' | 'PAYMENT_ALERT' | 'ANOMALY_REVIEW' | 'MAINTENANCE_ALERT';

const TYPE_BY_AGENT: Partial<Record<AgentName, NotificationType>> = {
  MAINTENANCE: 'MAINTENANCE_DUE',
  FINANCE: 'PAYMENT_ALERT',
  RISK: 'ANOMALY_REVIEW',
};

/**
 * Notification Agent — monitoring mode. Turns events into notifications:
 *   - customers: return reminders (due tomorrow/today) and overdue-return notices
 *   - operations: what the other agents found this cycle, PRIORITISED by severity —
 *     HIGH/CRITICAL individually, the rest in one digest (no alert fatigue)
 * Every notification has a dedupe key, so repeated cycles never spam anyone.
 */
export class NotificationMonitor extends MonitoringAgent {
  readonly name = 'NOTIFICATION' as const;
  readonly label = 'Notification Agent';

  protected async monitor(tools: ToolSession, _usage: unknown, ctx: MonitoringContext): Promise<MonitoringReport> {
    const today = isoDay(new Date());
    let sent = 0;
    const send = async (args: Record<string, unknown>) => {
      const result = (await tools.run('createNotification', args)) as { created: boolean };
      if (result.created) sent++;
    };

    // Customer-facing: returns
    const schedule = (await tools.run('getReturnsSchedule', {}, 'POLICY')) as { upcoming: ReturnRow[]; overdue: ReturnRow[] };
    for (const r of schedule.upcoming) {
      const when = r.daysUntilEnd === 0 ? 'today' : 'tomorrow';
      await send({
        audience: 'CUSTOMER',
        type: 'RETURN_REMINDER',
        priority: 'MEDIUM',
        subject: `Reminder: ${r.equipment.name} (${r.equipment.code}) is due back ${when}`,
        body: `Dear ${r.customer.contactName},\n\nThis is a reminder that ${r.equipment.name} (${r.equipment.code}), rental ${r.rental}, must be returned ${when} (${r.endDate}). If you need more time, please contact us before the return date.\n\nRentOps Team`,
        rentalCode: r.rental,
        dedupeKey: `notif:reminder:${r.rental}:${r.endDate}`,
      });
    }
    for (const r of schedule.overdue) {
      const days = -r.daysUntilEnd;
      await send({
        audience: 'CUSTOMER',
        type: 'RETURN_OVERDUE',
        priority: 'HIGH',
        subject: `Overdue: ${r.equipment.name} (${r.equipment.code}) was due back on ${r.endDate}`,
        body: `Dear ${r.customer.contactName},\n\nOur records show that ${r.equipment.name} (rental ${r.rental}) was due back ${days} day(s) ago, on ${r.endDate}. Please return it or contact us to arrange an extension.\n\nRentOps Team`,
        rentalCode: r.rental,
        dedupeKey: `notif:overdue:${r.rental}:${today}`,
      });
      await send({
        audience: 'OPERATIONS',
        type: 'RETURN_OVERDUE',
        priority: 'HIGH',
        subject: `[Overdue return] ${r.equipment.code} — ${r.customer.companyName}, ${days} day(s) late`,
        body: `Rental ${r.rental}: ${r.equipment.name} should have been returned on ${r.endDate}. Customer has been notified.`,
        rentalCode: r.rental,
        dedupeKey: `notif:ops-overdue:${r.rental}:${today}`,
      });
    }

    // Operations: findings from the other agents in this cycle, most severe first.
    // Overdue returns are already covered above.
    const fresh = ctx.findings
      .filter((f) => f.isNew && f.kind !== 'OVERDUE_RETURN')
      .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
    const urgent = fresh.filter((f) => SEVERITY_RANK[f.severity] >= SEVERITY_RANK.HIGH);
    const routine = fresh.filter((f) => SEVERITY_RANK[f.severity] < SEVERITY_RANK.HIGH);

    for (const f of urgent) {
      await send({
        audience: 'OPERATIONS',
        type: TYPE_BY_AGENT[f.agent] ?? 'MAINTENANCE_ALERT',
        priority: f.severity,
        subject: `[${f.severity}] ${f.title}`,
        body: f.detail,
        rentalCode: f.target.rentalCode,
        customerCode: f.target.customerCode,
        dedupeKey: `notif:${f.dedupeKey}`,
      });
    }
    if (routine.length) {
      const priority: Severity = routine.some((f) => f.severity === 'MEDIUM') ? 'MEDIUM' : 'LOW';
      await send({
        audience: 'OPERATIONS',
        type: 'MAINTENANCE_ALERT',
        priority,
        subject: `Monitoring digest — ${routine.length} item(s) to plan`,
        body: routine.map((f) => `• [${f.severity}] ${f.title}`).join('\n'),
        dedupeKey: `notif:digest:${ctx.cycleId}`,
      });
    }

    const reminders = schedule.upcoming.length + schedule.overdue.length;
    return {
      findings: [],
      decision: 'NONE',
      summary: `${sent} notification(s) sent — ${reminders} return reminder/overdue notice(s), ${urgent.length} urgent alert(s), ${routine.length ? 1 : 0} digest`,
    };
  }
}
