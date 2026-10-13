import type { DocumentCheck } from '../../services/document.service.js';

/**
 * Typed views over the facts gathered by tools (keyed by tool name).
 * Rules read facts through these accessors instead of poking at untyped JSON.
 */

export interface RentalRequestFact {
  code: string;
  status: string;
  equipment: { code: string; name: string; type: string };
  customer: { code: string; companyName: string };
  startDate: string;
  endDate: string;
  days: number;
  dailyRate: number;
  totalAmount: number;
  intendedUse: string | null;
  decisionReason: string | null;
  riskLevel: string | null;
  /** As typed in the public QR form — unverified. */
  submittedContact: { name: string | null; email: string | null; phone: string | null };
  paymentMethod: 'MPESA' | 'EMOLA' | 'BANK_TRANSFER' | 'CARD' | 'CASH' | null;
  approvalConditions: string[];
}

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  MPESA: 'M-Pesa',
  EMOLA: 'e-Mola',
  BANK_TRANSFER: 'bank transfer',
  CARD: 'card',
  CASH: 'cash',
};

export interface EquipmentFact {
  code: string;
  name: string;
  type: string;
  status: string;
  nextMaintenanceDue: string | null;
  lastMaintenanceAt: string | null;
  maintenanceOverdue: boolean;
  requiresOperatorLicense: boolean;
}

export interface AvailabilityFact {
  available: boolean;
  conflicts: { code: string; status: string; start: string; end: string }[];
}

export interface IssueFact {
  id: string;
  type: string;
  status: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' | null;
  description: string;
  reportedAt: string;
}

export interface CustomerFact {
  code: string;
  companyName: string;
  contactName: string;
  email: string;
  isBlocked: boolean;
  creditLimit: number | null;
  notes: string | null;
}

export interface HistoryFact {
  totalRentals: number;
  lateReturns: number;
  totalLateDays: number;
  damageIncidents: number;
}

export interface PaymentsFact {
  outstandingAmount: number;
  overdueCount: number;
  overdueAmount: number;
  oldestOverdueDays: number;
  unpaid: { reference: string; rental: string; amount: number; dueDate: string; status: string }[];
}

type Facts = Record<string, unknown>;

export const fact = {
  request: (f: Facts) => f.getRentalRequest as RentalRequestFact,
  equipment: (f: Facts) => f.getEquipment as EquipmentFact,
  availability: (f: Facts) => f.checkEquipmentAvailability as AvailabilityFact,
  openIssues: (f: Facts) => (f.getOpenIssues ?? []) as IssueFact[],
  customer: (f: Facts) => f.getCustomer as CustomerFact,
  history: (f: Facts) => f.getCustomerRentalHistory as HistoryFact,
  documents: (f: Facts) => f.checkDocuments as DocumentCheck,
  payments: (f: Facts) => f.getCustomerPayments as PaymentsFact,
};

export const humanizeDoc = (type: string) => type.toLowerCase().replace(/_/g, ' ');
