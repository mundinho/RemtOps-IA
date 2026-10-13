import type { MaintenanceOrderType, Severity } from '@prisma/client';
import { BUSINESS_RULES } from '../../config/businessRules.js';
import type { Finding } from '../core/MonitoringAgent.js';

export interface FleetItem {
  code: string;
  name: string;
  status: string;
  usageHours: number;
  hoursSinceService: number;
  serviceIntervalHours: number | null;
  hoursRatio: number | null;
  nextMaintenanceDue: string | null;
  daysUntilDue: number | null;
  openOrders: { code: string; type: string }[];
}

export interface MaintenancePlan {
  finding: Omit<Finding, 'agent' | 'isNew'>;
  order?: { type: MaintenanceOrderType; priority: Severity; reason: string; dueInDays: number };
  /** Take the machine out of the rentable pool (only applied when it is AVAILABLE). */
  flagPending?: boolean;
}

/**
 * Deterministic fleet rules: engine hours against the service interval, and service dates.
 * Machines already in the workshop are skipped — they are being handled.
 */
export function planFleetMaintenance(fleet: FleetItem[]): MaintenancePlan[] {
  const { serviceHoursWarningRatio, serviceDueSoonDays } = BUSINESS_RULES.monitoring;
  const plans: MaintenancePlan[] = [];

  for (const e of fleet) {
    if (e.status === 'MAINTENANCE' || e.status === 'RETIRED') continue;
    const target = { equipmentCode: e.code };

    // Engine hours
    if (e.serviceIntervalHours && e.hoursSinceService >= e.serviceIntervalHours) {
      const reason = `${e.code} ${e.name} reached its maintenance limit: ${e.hoursSinceService} h since last service (limit ${e.serviceIntervalHours} h).`;
      plans.push({
        finding: {
          kind: 'SERVICE_HOURS_EXCEEDED',
          severity: 'HIGH',
          title: `${e.code} reached its engine-hour limit — maintenance order created`,
          detail: `${reason} Status set to maintenance pending.`,
          target,
          dedupeKey: `maint:hours:${e.code}:${e.usageHours - e.hoursSinceService}`,
        },
        order: { type: 'PREVENTIVE', priority: 'HIGH', reason, dueInDays: 3 },
        flagPending: true,
      });
    } else if (e.hoursRatio != null && e.hoursRatio >= serviceHoursWarningRatio) {
      plans.push({
        finding: {
          kind: 'SERVICE_HOURS_APPROACHING',
          severity: 'MEDIUM',
          title: `${e.code} at ${Math.round(e.hoursRatio * 100)}% of its service interval`,
          detail: `${e.code} ${e.name}: ${e.hoursSinceService} of ${e.serviceIntervalHours} engine hours used since last service. Schedule the service soon.`,
          target,
          dedupeKey: `maint:hours-warning:${e.code}:${e.usageHours - e.hoursSinceService}`,
        },
      });
    }

    // Service date
    if (e.daysUntilDue != null && e.daysUntilDue < 0) {
      const reason = `${e.code} ${e.name}: scheduled service was due on ${e.nextMaintenanceDue} (${-e.daysUntilDue} days ago).`;
      plans.push({
        finding: {
          kind: 'SERVICE_OVERDUE',
          severity: 'HIGH',
          title: `${e.code} service overdue by ${-e.daysUntilDue} days — maintenance order created`,
          detail: reason,
          target,
          dedupeKey: `maint:date:${e.code}:${e.nextMaintenanceDue}`,
        },
        order: { type: 'PREVENTIVE', priority: 'HIGH', reason, dueInDays: 2 },
        flagPending: true,
      });
    } else if (e.daysUntilDue != null && e.daysUntilDue <= serviceDueSoonDays) {
      plans.push({
        finding: {
          kind: 'SERVICE_DUE_SOON',
          severity: 'LOW',
          title: `${e.code} service due in ${e.daysUntilDue} days`,
          detail: `${e.code} ${e.name}: scheduled service on ${e.nextMaintenanceDue}.`,
          target,
          dedupeKey: `maint:due-soon:${e.code}:${e.nextMaintenanceDue}`,
        },
      });
    }
  }
  return plans;
}
