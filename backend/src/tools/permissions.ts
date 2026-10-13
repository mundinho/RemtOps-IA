import type { AgentName } from '@prisma/client';
import type { ToolName } from './registry.js';

/**
 * Least privilege: each agent can only reach the tools its job needs.
 * Anything outside this list is DENIED by the ToolExecutor, recorded and audited —
 * no matter what the LLM asks for.
 *
 * Note what is deliberately absent:
 *   - only the Approval Agent can approve a rental (confirmRental) or close cases
 *   - no agent can set equipment back to AVAILABLE or unblock a customer
 *   - only the Finance Agent touches payments; only the Maintenance Agent opens work orders
 *   - the Risk Agent can flag anomalies, but cannot reject or block anything itself
 */
export const AGENT_TOOL_PERMISSIONS: Record<AgentName, readonly ToolName[]> = {
  // Coordinates the process; owns no data tools.
  ORCHESTRATOR: [],

  // Reserved for the Document Agent (photo checks) — not implemented yet, so no tools.
  DOCUMENTS: [],

  RENTAL: ['getRentalRequest', 'getEquipment', 'checkEquipmentAvailability', 'openCase'],

  MAINTENANCE: [
    // rental workflow
    'getRentalRequest',
    'getEquipment',
    'getMaintenanceHistory',
    'getOpenIssues',
    'classifyIssue',
    'updateEquipmentStatus',
    'openCase',
    // monitoring
    'getFleetMaintenanceStatus',
    'getRecentIssueReports',
    'createMaintenanceOrder',
    'flagEquipmentForMaintenance',
    'createAlert',
  ],

  RISK: [
    // rental workflow
    'getRentalRequest',
    'getCustomer',
    'getCustomerRentalHistory',
    'checkDocuments',
    'recordRiskAssessment',
    'openCase',
    // monitoring
    'getCustomerReturnPatterns',
    'getOperationalConsistency',
    'openAnomalyCase',
    'createAlert',
  ],

  FINANCE: [
    // rental workflow
    'getRentalRequest',
    'getCustomer',
    'getCustomerPayments',
    'createPayment',
    'openCase',
    // monitoring
    'getPaymentsOverview',
    'markPaymentOverdue',
    'getFinanceSummary',
    'createAlert',
  ],

  // The autonomous decision-maker: final approval of every request, and triage of anomaly cases.
  APPROVAL: [
    'getRentalRequest',
    'getCaseFindings',
    'checkEquipmentAvailability',
    'getCustomer',
    'getCustomerRentalHistory',
    'getCustomerPayments',
    'confirmRental',
    'resolveCase',
    'getPendingAnomalies',
    'triageAnomaly',
  ],

  NOTIFICATION: ['getRentalRequest', 'getCustomer', 'getReturnsSchedule', 'createNotification'],

  // Talks to the public: read-only, public-safe tools only. It cannot create, approve or change anything.
  ASSISTANT: ['getMachineInfo', 'checkDatesAvailability', 'getRentalPolicy', 'getMyRequestStatus'],

  // Validates self-registrations from the facts it is handed; its only effect (account status) is audited.
  ONBOARDING: [],
};

export function isToolAllowed(agent: AgentName, tool: string): boolean {
  return (AGENT_TOOL_PERMISSIONS[agent] as readonly string[]).includes(tool);
}
