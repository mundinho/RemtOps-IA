// Mirrors the backend API contracts (dates arrive as ISO strings).

export type EquipmentType = 'EXCAVATOR' | 'BULLDOZER' | 'GENERATOR' | 'CRANE' | 'LOADER' | 'COMPACTOR' | 'OTHER';
export type EquipmentStatus = 'AVAILABLE' | 'RESERVED' | 'RENTED' | 'MAINTENANCE_PENDING' | 'MAINTENANCE' | 'BLOCKED' | 'RETIRED';
export type RentalStatus =
  | 'REQUESTED'
  | 'IN_REVIEW'
  | 'REQUIRES_HUMAN_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'ACTIVE'
  | 'COMPLETED'
  | 'CANCELLED';
export type WorkflowStep =
  | 'INTAKE'
  | 'MAINTENANCE_CHECK'
  | 'RISK_ASSESSMENT'
  | 'FINANCE_CHECK'
  | 'AWAITING_HUMAN'
  | 'FINALIZE'
  | 'BILLING'
  | 'NOTIFY'
  | 'DONE';
export type AgentName = 'ORCHESTRATOR' | 'RENTAL' | 'MAINTENANCE' | 'RISK' | 'FINANCE' | 'APPROVAL' | 'NOTIFICATION' | 'ASSISTANT' | 'ONBOARDING';
export type AgentDecision = 'PROCEED' | 'APPROVE' | 'REJECT' | 'BLOCK' | 'ESCALATE' | 'NONE';
export type ExecutionStatus = 'RUNNING' | 'SUCCEEDED' | 'FAILED';
export type ToolCallStatus = 'SUCCESS' | 'ERROR' | 'DENIED';
export type Severity = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
export type RiskLevel = 'LOW' | 'MEDIUM' | 'HIGH';
export type ReviewStatus = 'PENDING' | 'APPROVED' | 'REJECTED';
export type AlertStatus = 'OPEN' | 'ACKNOWLEDGED' | 'RESOLVED';
export type MaintenanceType = 'SCHEDULED_SERVICE' | 'INSPECTION' | 'REPAIR' | 'ISSUE_REPORT';
export type MaintenanceStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface CustomerRef {
  code: string;
  companyName: string;
}

export interface EquipmentRef {
  code: string;
  name: string;
  type?: EquipmentType;
}

export interface RentalRef {
  id: string;
  code: string;
}

// ── Equipment ──

export interface CurrentRental extends RentalRef {
  status: RentalStatus;
  startDate: string;
  endDate: string;
  customer: CustomerRef;
}

export interface Equipment {
  id: string;
  code: string;
  name: string;
  type: EquipmentType;
  brand: string;
  model: string;
  serialNumber: string;
  status: EquipmentStatus;
  dailyRate: number;
  location: string | null;
  lastMaintenanceAt: string | null;
  nextMaintenanceDue: string | null;
  requiresOperatorLicense: boolean;
  maintenanceOverdue: boolean;
  openIssues: number;
  currentRental: CurrentRental | null;
  usageHours: number;
  hoursAtLastService: number;
  serviceIntervalHours: number | null;
}

export type MaintenanceOrderStatus = 'OPEN' | 'SCHEDULED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface MaintenanceOrder {
  id: string;
  code: string;
  type: 'PREVENTIVE' | 'CORRECTIVE' | 'INSPECTION';
  status: MaintenanceOrderStatus;
  priority: Severity;
  reason: string;
  createdByAgent: AgentName | null;
  dueBy: string | null;
  createdAt: string;
  equipment?: { code: string; name: string; status: EquipmentStatus };
}

export type PaymentStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Payment {
  id: string;
  reference: string;
  amount: number;
  dueDate: string;
  status: PaymentStatus;
  paidAt: string | null;
  method: PaymentMethod | null;
  customer: CustomerRef;
  rental: RentalRef & { endDate: string; equipment: { code: string; name: string } };
}

export interface FinanceSummary {
  currency: string;
  pendingAmount: number;
  pendingCount: number;
  overdueAmount: number;
  overdueCount: number;
  collectedLast30Days: number;
}

export interface Maintenance {
  id: string;
  type: MaintenanceType;
  status: MaintenanceStatus;
  severity: Severity | null;
  description: string;
  performedBy: string | null;
  performedAt: string | null;
  nextDueAt: string | null;
  reportedAt: string;
  resolvedAt: string | null;
}

export interface EquipmentDetail extends Equipment {
  maintenances: Maintenance[];
  maintenanceOrders: MaintenanceOrder[];
  upcomingRentals: Rental[];
  qrUrl: string;
}

// ── Rentals ──

export interface Rental {
  id: string;
  code: string;
  startDate: string;
  endDate: string;
  dailyRate: number;
  totalAmount: number;
  intendedUse: string | null;
  status: RentalStatus;
  workflowStep: WorkflowStep;
  riskLevel: RiskLevel | null;
  riskScore: number | null;
  decisionReason: string | null;
  decidedByAgent: AgentName | null;
  decidedAt: string | null;
  lateDays: number;
  damageReported: boolean;
  damageNotes: string | null;
  contactName: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  contactCountry: string | null;
  paymentMethod: PaymentMethod | null;
  approvalConditions: string[];
  createdAt: string;
  updatedAt: string;
  customer: CustomerRef;
  equipment: EquipmentRef;
}

export interface RentalDetail extends Rental {
  reviews: HumanReview[];
  notifications: Notification[];
  alerts: Alert[];
}

// ── Agents & observability ──

export interface AgentExecutionSummary {
  id: string;
  agent: AgentName;
  decision: AgentDecision | null;
  summary: string | null;
  status: ExecutionStatus;
  startedAt: string;
  rental: RentalRef | { code: string } | null;
}

export interface AgentExecution extends AgentExecutionSummary {
  correlationId: string;
  step: WorkflowStep | null;
  trigger: string;
  reasoning: string | null;
  confidence: number | null;
  input: unknown;
  output: unknown;
  usedLLM: boolean;
  model: string | null;
  policyOverride: boolean;
  error: string | null;
  finishedAt: string | null;
  durationMs: number | null;
  _count?: { toolCalls: number };
}

export interface ToolCall {
  id: string;
  toolName: string;
  /** LLM = the model chose it · POLICY = required evidence the model skipped · AGENT = an action by agent code */
  source: 'LLM' | 'POLICY' | 'AGENT';
  arguments: unknown;
  result: unknown;
  status: ToolCallStatus;
  errorMessage: string | null;
  durationMs: number | null;
  createdAt: string;
}

export interface AgentExecutionDetail extends AgentExecution {
  toolCalls: ToolCall[];
}

export interface HumanReview {
  id: string;
  rentalId: string;
  requestedByAgent: AgentName;
  reason: string;
  analyzedData: unknown;
  recommendedAction: string;
  priority: Severity;
  status: ReviewStatus;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  /** RENTAL_DECISION pauses a workflow; ANOMALY flags a pattern for a human (never an accusation). */
  kind: 'RENTAL_DECISION' | 'ANOMALY';
  rental?: (RentalRef & {
    startDate: string;
    endDate: string;
    customer: CustomerRef;
    equipment: EquipmentRef;
  }) | null;
  customer?: CustomerRef | null;
  equipment?: EquipmentRef | null;
  /** The agent that decided the case (autonomous mode — no person decides). */
  resolvedByAgent: AgentName | null;
}

export type AlertCategory = 'MAINTENANCE' | 'FINANCE' | 'RISK' | 'OPERATIONS';

export interface Alert {
  id: string;
  sourceAgent: AgentName;
  category?: AlertCategory;
  severity: Severity;
  title: string;
  message?: string;
  status?: AlertStatus;
  createdAt: string;
  equipment?: { code: string; name: string } | null;
  rental?: RentalRef | null;
  customer?: CustomerRef | null;
}

export interface Notification {
  id: string;
  type: string;
  channel: 'EMAIL' | 'SMS' | 'INTERNAL';
  priority: Severity;
  recipient: string;
  subject: string;
  body: string;
  status: string;
  createdAt: string;
  rental?: RentalRef | null;
  customer?: CustomerRef | null;
}

export interface MonitoringStatus {
  running: boolean;
  lastCycle: { correlationId: string; startedAt: string; summary: string | null } | null;
}

export interface Overview {
  kpis: {
    totalEquipment: number;
    availableEquipment: number;
    rentedEquipment: number;
    maintenanceEquipment: number;
    activeRentals: number;
    pendingRentals: number;
    openAlerts: number;
    pendingReviews: number;
    outstandingAmount: number;
    overdueAmount: number;
    openMaintenanceOrders: number;
    approvedByAi: number;
    rejectedByAgents: number;
  };
  maintenanceWatch: {
    code: string;
    name: string;
    status: EquipmentStatus;
    nextMaintenanceDue: string | null;
    overdue: boolean;
  }[];
  recentActivity: AgentExecutionSummary[];
  /** Latest flagged cases decided by the AI. */
  reviewQueue: {
    id: string;
    kind: 'RENTAL_DECISION' | 'ANOMALY';
    status: ReviewStatus;
    reason: string;
    resolutionNotes: string | null;
    resolvedByAgent: AgentName | null;
    resolvedAt: string | null;
    requestedByAgent: AgentName;
    priority: Severity;
    createdAt: string;
    rental: RentalRef | null;
    customer: CustomerRef | null;
    equipment: { code: string; name: string } | null;
  }[];
  alertFeed: Alert[];
}

// ── Public (QR) ──

export interface CustomerOption {
  id: string;
  code: string;
  companyName: string;
  contactName: string;
  taxId: string;
  email: string;
  phone: string | null;
  country: string;
  isBlocked: boolean;
}

export type PaymentMethod = 'MPESA' | 'EMOLA' | 'BANK_TRANSFER' | 'CARD' | 'CASH';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export interface PublicEquipment {
  code: string;
  name: string;
  type: EquipmentType;
  brand: string;
  model: string;
  status: EquipmentStatus;
  location: string | null;
  dailyRate: number;
  requiresOperatorLicense: boolean;
  /** Share of the total charged up front by M-Pesa (and optional cap per transaction). */
  mpesa: { depositPercent: number; maxAmount: number | null };
}

export interface RentalRequestPayload {
  companyName: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  paymentMethod: PaymentMethod;
  startDate: string;
  endDate: string;
  intendedUse?: string;
}

export interface RentalRequestCreated {
  id: string;
  code: string;
  status: RentalStatus;
  statusUrl: string;
}

export interface RequestStatus {
  id: string;
  code: string;
  status: RentalStatus;
  workflowStep: WorkflowStep;
  decisionReason: string | null;
  startDate: string;
  endDate: string;
  totalAmount: number;
  paymentMethod: PaymentMethod | null;
  approvalConditions: string[];
  contactName: string | null;
  equipment: EquipmentRef;
  customer: { companyName: string };
  createdAt: string;
  updatedAt: string;
  mpesa: RentalDeposit | null;
}

export type CustomerDocumentType = 'ID_DOCUMENT' | 'INSURANCE_CERTIFICATE' | 'OPERATOR_LICENSE' | 'COMPANY_REGISTRATION';

export interface CustomerDocument {
  type: CustomerDocumentType | 'RENTAL_CONTRACT';
  status: 'VALID' | 'PENDING_VERIFICATION' | 'EXPIRED' | 'REJECTED';
  documentNumber: string | null;
  expiresAt: string | null;
}

/** Customer as managed by the admin on the Customers page. */
export interface Customer extends CustomerOption {
  creditLimit: number | null;
  notes: string | null;
  rentalCount: number;
  createdAt: string;
  documents: CustomerDocument[];
  /** Portal account (self-registration). null = no account. */
  loginEmail: string | null;
  accountStatus: AccountStatus | null;
  accountDecisionReason: string | null;
}

// ── Accounts & sign-in ──

export type StaffRole = 'ADMIN' | 'OPERATOR';
export type AccountStatus = 'PENDING' | 'ACTIVE' | 'REJECTED';

export interface StaffUser {
  id: string;
  name: string;
  email: string;
  role: StaffRole | 'REVIEWER';
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CustomerRegistrationPayload {
  companyName: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  password: string;
}

export interface RegistrationStatus {
  companyName: string;
  email: string | null;
  status: AccountStatus;
  reason: string | null;
}

export interface CustomerPortal {
  profile: {
    code: string;
    companyName: string;
    taxId: string;
    contactName: string;
    email: string;
    phone: string | null;
    country: string;
    loginEmail: string | null;
    accountStatus: AccountStatus | null;
    accountDecisionReason: string | null;
    memberSince: string;
  };
  documents: { type: CustomerDocumentType; status: CustomerDocument['status']; expiresAt: string | null }[];
  rentals: {
    id: string;
    code: string;
    equipment: { code: string; name: string };
    startDate: string;
    endDate: string;
    totalAmount: number | null;
    status: RentalStatus;
    customerMessage: string | null;
    approvalConditions: string[];
    createdAt: string;
  }[];
}

export interface CustomerPayload {
  companyName: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  country: string;
  creditLimit: number | null;
  notes: string;
  documents: { type: CustomerDocumentType; documentNumber: string; expiresAt: string }[];
}

export interface StatPoint {
  label: string;
  value: number;
}

export interface Statistics {
  kpis: {
    totalRequests: number;
    approved: number;
    rejected: number;
    inProgress: number;
    approvalRate: number | null;
    revenueBooked: number;
    avgDecisionSeconds: number | null;
    llmTokens: number;
  };
  rentalsByMonth: { key: string; approved: number; rejected: number; inProgress: number }[];
  rejectionReasons: StatPoint[];
  revenueByEquipment: StatPoint[];
  paymentMethods: StatPoint[];
  paymentsByStatus: StatPoint[];
  fleetStatus: StatPoint[];
  agents: (StatPoint & { runs: number; tokens: number })[];
}

/** Deposit paid with M-Pesa before the request was submitted (request status page). */
export interface RentalDeposit {
  amount: number | null;
  transactionId: string | null;
  paidAt: string | null;
  /** Set when the request was rejected/cancelled: the deposit is refunded manually by finance. */
  refund: { refundedAt: string | null } | null;
  simulated: boolean;
}

/** M-Pesa checkout, polled while the customer confirms with their PIN. */
export interface MpesaCheckout {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amount: number | null;
  rentalId: string | null;
  transactionId: string | null;
  message: string | null;
}

export interface MpesaRefund {
  id: string;
  amount: number | null;
  msisdn: string;
  transactionId: string | null;
  paidAt: string | null;
  rental: { id: string; code: string; decisionReason: string | null; customer: { code: string; companyName: string } } | null;
  refundedAt: string | null;
  refundedBy: string | null;
  refundNote: string | null;
}

export type ReportType = 'financial' | 'rentals' | 'fleet' | 'agents';
export type ReportFormat = 'money' | 'number' | 'percent' | 'seconds' | 'text' | 'date';

export interface Report {
  type: ReportType;
  title: string;
  period: { from: string; to: string; days: number };
  generatedAt: string;
  kpis: { label: string; value: number | string; format: ReportFormat; hint?: string }[];
  breakdowns: { title: string; format: ReportFormat; items: { label: string; value: number }[] }[];
  table: { columns: { key: string; label: string; format?: ReportFormat }[]; rows: Record<string, string | number | null>[] };
}
