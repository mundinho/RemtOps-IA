import * as assistantTools from './assistant.tools.js';
import * as customerTools from './customer.tools.js';
import * as equipmentTools from './equipment.tools.js';
import * as financeTools from './finance.tools.js';
import * as maintenanceTools from './maintenance.tools.js';
import * as notificationTools from './notification.tools.js';
import * as rentalTools from './rental.tools.js';
import * as reviewTools from './review.tools.js';
import * as riskTools from './risk.tools.js';
import type { ToolDefinition } from './types.js';

/** Every tool in the system. Which agent may use which is decided in permissions.ts. */
export const TOOL_REGISTRY = {
  ...rentalTools,
  ...equipmentTools,
  ...maintenanceTools,
  ...customerTools,
  ...financeTools,
  ...riskTools,
  ...reviewTools,
  ...notificationTools,
  ...assistantTools,
};

export type ToolName = keyof typeof TOOL_REGISTRY;

export function getTool(name: string): ToolDefinition | undefined {
  return (TOOL_REGISTRY as Record<string, ToolDefinition>)[name];
}
