/** One place that maps every backend status/enum to a label and a colour tone. */

export type Tone = 'green' | 'blue' | 'amber' | 'red' | 'violet' | 'teal' | 'slate';

export const TONE_CLASSES: Record<Tone, { badge: string; dot: string; soft: string; text: string }> = {
  green: { badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20', dot: 'bg-emerald-500', soft: 'bg-emerald-50', text: 'text-emerald-600' },
  blue: { badge: 'bg-sky-50 text-sky-700 ring-sky-600/20', dot: 'bg-sky-500', soft: 'bg-sky-50', text: 'text-sky-600' },
  amber: { badge: 'bg-amber-50 text-amber-800 ring-amber-600/25', dot: 'bg-amber-500', soft: 'bg-amber-50', text: 'text-amber-600' },
  red: { badge: 'bg-rose-50 text-rose-700 ring-rose-600/20', dot: 'bg-rose-500', soft: 'bg-rose-50', text: 'text-rose-600' },
  violet: { badge: 'bg-violet-50 text-violet-700 ring-violet-600/20', dot: 'bg-violet-500', soft: 'bg-violet-50', text: 'text-violet-600' },
  teal: { badge: 'bg-teal-50 text-teal-700 ring-teal-600/20', dot: 'bg-teal-500', soft: 'bg-teal-50', text: 'text-teal-600' },
  slate: { badge: 'bg-slate-100 text-slate-700 ring-slate-500/20', dot: 'bg-slate-400', soft: 'bg-slate-100', text: 'text-slate-500' },
};

const STATUS_META: Record<string, { label: string; tone: Tone }> = {
  // Equipment
  AVAILABLE: { label: 'Available', tone: 'green' },
  RESERVED: { label: 'Reserved', tone: 'blue' },
  RENTED: { label: 'Rented', tone: 'blue' },
  MAINTENANCE_PENDING: { label: 'Service pending', tone: 'amber' },
  MAINTENANCE: { label: 'Maintenance', tone: 'amber' },
  BLOCKED: { label: 'Blocked', tone: 'red' },
  RETIRED: { label: 'Retired', tone: 'slate' },
  // Rentals
  REQUESTED: { label: 'Requested', tone: 'slate' },
  IN_REVIEW: { label: 'Agents reviewing', tone: 'blue' },
  REQUIRES_HUMAN_REVIEW: { label: 'Flagged', tone: 'violet' }, // legacy status, not used in autonomous mode
  APPROVED: { label: 'Approved', tone: 'green' },
  REJECTED: { label: 'Rejected', tone: 'red' },
  ACTIVE: { label: 'Active', tone: 'blue' },
  COMPLETED: { label: 'Completed', tone: 'slate' },
  CANCELLED: { label: 'Cancelled', tone: 'slate' },
  // Agent decisions
  PROCEED: { label: 'Proceed', tone: 'green' },
  APPROVE: { label: 'Approve', tone: 'green' },
  REJECT: { label: 'Reject', tone: 'red' },
  BLOCK: { label: 'Block', tone: 'red' },
  ESCALATE: { label: 'Escalate', tone: 'violet' },
  NONE: { label: 'Done', tone: 'slate' },
  // Executions & tool calls
  RUNNING: { label: 'Running', tone: 'blue' },
  SUCCEEDED: { label: 'Succeeded', tone: 'green' },
  FAILED: { label: 'Failed', tone: 'red' },
  SUCCESS: { label: 'Success', tone: 'green' },
  ERROR: { label: 'Error', tone: 'red' },
  DENIED: { label: 'Denied', tone: 'red' },
  // Reviews, alerts, maintenance
  PENDING: { label: 'Pending', tone: 'violet' },
  OPEN: { label: 'Open', tone: 'amber' },
  IN_PROGRESS: { label: 'In progress', tone: 'blue' },
  ACKNOWLEDGED: { label: 'Acknowledged', tone: 'slate' },
  RESOLVED: { label: 'Resolved', tone: 'green' },
  // Customer documents
  VALID: { label: 'Valid', tone: 'green' },
  EXPIRED: { label: 'Expired', tone: 'red' },
  PENDING_VERIFICATION: { label: 'Being verified', tone: 'blue' },
  // Payments & maintenance orders
  PAID: { label: 'Paid', tone: 'green' },
  OVERDUE: { label: 'Overdue', tone: 'red' },
  SCHEDULED: { label: 'Scheduled', tone: 'blue' },
  PREVENTIVE: { label: 'Preventive', tone: 'slate' },
  CORRECTIVE: { label: 'Corrective', tone: 'amber' },
  INSPECTION: { label: 'Inspection', tone: 'violet' },
  // Alert categories
  FINANCE: { label: 'Finance', tone: 'green' },
  RISK: { label: 'Risk', tone: 'violet' },
  OPERATIONS: { label: 'Operations', tone: 'slate' },
  // Severity / risk
  LOW: { label: 'Low', tone: 'slate' },
  MEDIUM: { label: 'Medium', tone: 'amber' },
  HIGH: { label: 'High', tone: 'red' },
  CRITICAL: { label: 'Critical', tone: 'red' },
};

export function statusMeta(status: string): { label: string; tone: Tone } {
  return STATUS_META[status] ?? { label: status, tone: 'slate' };
}

export const FINAL_RENTAL_STATUSES = ['APPROVED', 'REJECTED', 'ACTIVE', 'COMPLETED', 'CANCELLED'];

export const EQUIPMENT_TYPE_LABELS: Record<string, string> = {
  EXCAVATOR: 'Excavator',
  BULLDOZER: 'Bulldozer',
  GENERATOR: 'Generator',
  CRANE: 'Crane',
  LOADER: 'Loader',
  COMPACTOR: 'Compactor',
  OTHER: 'Other',
};
