import type { DocumentType } from '@prisma/client';

/**
 * Company policy in one place.
 *
 * These values feed the deterministic rules that agents (and the Policy Guard) enforce.
 * The LLM never decides these thresholds — it only reasons within them.
 */
export const BUSINESS_RULES = {
  maxRentalDays: 90,

  /** Currency of every amount in the system. */
  currency: 'MZN',

  /** Any rental above this total (MZN) is always flagged for the Approval Agent, regardless of risk. */
  humanApprovalValueThreshold: 1_500_000,

  /** Cash payments above this amount (MZN) need a manager's approval. */
  maxCashPayment: 250_000,

  /** Below this self-reported confidence the agent must escalate instead of deciding. */
  minLlmConfidence: 0.75,

  /** Hard cap on tool-calling iterations per agent run (prevents runaway loops). */
  maxAgentSteps: 6,

  /** Documents every customer must hold with status VALID and not expired. */
  alwaysRequiredDocuments: ['ID_DOCUMENT', 'INSURANCE_CERTIFICATE'] satisfies DocumentType[],

  /** Additional document for equipment flagged `requiresOperatorLicense`. */
  operatorLicenseDocument: 'OPERATOR_LICENSE' satisfies DocumentType,

  /** Customer history thresholds that trigger an escalation. */
  history: {
    maxLateReturnsBeforeReview: 1,
    maxDamageIncidentsBeforeReview: 1,
  },

  /**
   * Fully autonomous operation: no human decides anything. Checks that find a problem raise a FLAG
   * and the workflow continues; the Approval Agent (AI) takes the final decision on every request.
   * When the AI is not confident or fails, the request is REJECTED (fail-safe — never approve in doubt).
   */
  autonomy: {
    /** Flags the Approval Agent may never override: the request is rejected without asking the AI. */
    nonOverridableRules: [
      'identity.contact_mismatch',
      'payments.overdue',
      'credit.limit_exceeded',
      'issue.high',
      'issue.critical',
    ],
  },

  /** Proactive monitoring (Maintenance, Finance, Risk, Notification agents). */
  monitoring: {
    /** Flag equipment when this share of its service interval (engine hours) is used. */
    serviceHoursWarningRatio: 0.9,
    /** Flag scheduled services due within this many days. */
    serviceDueSoonDays: 14,
    /** Issue reports on one machine within this window are checked for a recurring problem. */
    recurringIssueWindowDays: 180,
    recurringIssueMinReports: 2,
    /** "N late returns among the last M rentals" is reported as an anomaly. */
    lateReturnPattern: { lateCount: 3, window: 5 },
    /** Meter readings above this many hours per rental day are physically implausible. */
    maxPlausibleHoursPerDay: 24,
    /** Remind customers this many days before the return date. */
    returnReminderDays: 1,
  },
} as const;
