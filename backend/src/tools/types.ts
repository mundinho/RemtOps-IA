import type { AgentName } from '@prisma/client';
import type { z } from 'zod';
import type { getRentalScope } from '../services/rental.service.js';

export type RentalScope = Awaited<ReturnType<typeof getRentalScope>>;

/**
 * What a tool knows about the call: which agent, which execution, which rental.
 * In a rental workflow, entity ids come from here — never from LLM-generated arguments — so a
 * hallucinated id can't read or modify a record outside the current workflow.
 * Monitoring runs have no rental: fleet-wide tools take entity codes chosen by agent CODE
 * (from deterministic findings), and the service layer validates they exist.
 */
export interface ToolContext {
  agent: AgentName;
  executionId: string;
  /** rentalId for workflows, the monitoring cycle id otherwise. */
  correlationId: string;
  rentalId: string | null;
  /** The machine whose QR code was scanned (customer assistant) — fixed by the server, not by the model. */
  equipmentCode: string | null;
  /** Throws when called outside a rental workflow. */
  scope: () => Promise<RentalScope>;
}

export interface ToolDefinition<S extends z.ZodObject = z.ZodObject> {
  name: string;
  /** Shown to the LLM — written for the model, not for humans. */
  description: string;
  /** read = no side effects (offered to the LLM). write = side effects, executed by agent code and audited. */
  kind: 'read' | 'write';
  parameters: S;
  /** For write tools: the audit entry the executor records automatically. */
  audit?: { action: string; entityType: string };
  handler: (args: z.infer<S>, ctx: ToolContext) => Promise<unknown>;
}

/** Identity helper that keeps `args` typed from the zod schema. */
export function defineTool<S extends z.ZodObject>(tool: ToolDefinition<S>): ToolDefinition<S> {
  return tool;
}
