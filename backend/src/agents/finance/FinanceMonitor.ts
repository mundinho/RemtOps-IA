import type { ToolSession } from '../../tools/toolExecutor.js';
import { formatMzn } from '../../utils/money.js';
import { countSummary, MonitoringAgent, type Finding, type MonitoringReport } from '../core/MonitoringAgent.js';

interface UnpaidPayment {
  reference: string;
  amount: number;
  status: 'PENDING' | 'OVERDUE';
  dueDate: string;
  daysOverdue: number;
  customer: { code: string; companyName: string };
  rental: { code: string; status: string; endDate: string; daysUntilEnd: number; equipment: { code: string; name: string } };
}

interface FinanceSummary {
  pendingAmount: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  collectedLast30Days: number;
}

/**
 * Finance Agent — monitoring mode. Deterministic by design (money is rules, not AI):
 *   - pending payments past their due date → marked OVERDUE + alert
 *   - rentals ending within a day with money still owed → alert before the machine comes back
 *   - totals for reporting (stored in the execution output and shown on the Finance page)
 */
export class FinanceMonitor extends MonitoringAgent {
  readonly name = 'FINANCE' as const;
  readonly label = 'Finance Agent';

  protected async monitor(tools: ToolSession): Promise<MonitoringReport> {
    const findings: Finding[] = [];
    const unpaid = (await tools.run('getPaymentsOverview', {}, 'POLICY')) as UnpaidPayment[];

    for (const p of unpaid) {
      const target = { customerCode: p.customer.code, rentalCode: p.rental.code, equipmentCode: p.rental.equipment.code };

      if (p.daysOverdue > 0) {
        if (p.status === 'PENDING') await tools.run('markPaymentOverdue', { paymentReference: p.reference });
        findings.push(
          await this.raise(tools, {
            kind: 'PAYMENT_OVERDUE',
            severity: 'HIGH',
            title: `Payment ${p.reference} overdue — ${formatMzn(p.amount)} (${p.customer.companyName})`,
            detail: `Payment for rental ${p.rental.code} (${p.rental.equipment.name}) was due on ${p.dueDate} and is ${p.daysOverdue} days overdue.`,
            target,
            dedupeKey: `fin:overdue:${p.reference}`,
          }),
        );
      }

      const activeRental = p.rental.status === 'ACTIVE' || p.rental.status === 'APPROVED';
      if (activeRental && p.rental.daysUntilEnd >= 0 && p.rental.daysUntilEnd <= 1) {
        const when = p.rental.daysUntilEnd === 0 ? 'today' : 'tomorrow';
        findings.push(
          await this.raise(tools, {
            kind: 'PAYMENT_DUE_AT_RETURN',
            severity: 'MEDIUM',
            title: `Rental ${p.rental.code} ends ${when} with ${formatMzn(p.amount)} pending`,
            detail: `Rental ${p.rental.code} (${p.rental.equipment.code} ${p.rental.equipment.name}, ${p.customer.companyName}) ends ${when} and has a pending payment of ${formatMzn(p.amount)}.`,
            target,
            dedupeKey: `fin:return:${p.reference}:${p.rental.endDate}`,
          }),
        );
      }
    }

    const summary = (await tools.run('getFinanceSummary', {}, 'POLICY')) as FinanceSummary;
    return {
      findings,
      summary: `Payments check: ${countSummary(findings, 'finding')} · outstanding ${formatMzn(summary.pendingAmount + summary.overdueAmount)}`,
      output: JSON.parse(JSON.stringify({ findings, report: summary })),
    };
  }
}
