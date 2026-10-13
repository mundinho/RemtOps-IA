import type { AgentName, Prisma, ToolCallSource } from '@prisma/client';
import { z } from 'zod';
import type { ToolSpec } from '../llm/types.js';
import { recordToolCall } from '../services/agentExecution.service.js';
import { writeAuditLog } from '../services/audit.service.js';
import { getRentalScope } from '../services/rental.service.js';
import { isToolAllowed } from './permissions.js';
import { getTool } from './registry.js';
import type { RentalScope, ToolContext } from './types.js';

export type ToolOutcome = { ok: true; result: unknown } | { ok: false; error: string };

/**
 * The single gateway between agents and data. Every tool call — whether the LLM asked for it
 * or the agent's own code — passes through here and gets the same treatment:
 *
 *   1. permission check  → not in the agent's allowlist? DENIED, recorded, audited
 *   2. argument validation (zod) → invalid? ERROR, recorded, message returned to the model
 *   3. execution through the service layer
 *   4. recorded as AgentToolCall (args, result, duration, who asked)
 *   5. write tools are audited automatically — an agent cannot "forget" to log
 *
 * One session per agent execution; it also keeps the facts gathered so far.
 */
export class ToolSession {
  /** Latest successful result of each read tool — the evidence the agent's decision is based on. */
  readonly facts: Record<string, unknown> = {};
  private readonly ctx: ToolContext;

  constructor(
    agent: AgentName,
    executionId: string,
    target: ({ rentalId: string } | { correlationId: string }) & { equipmentCode?: string },
  ) {
    let scope: Promise<RentalScope> | undefined;
    const rentalId = 'rentalId' in target ? target.rentalId : null;
    this.ctx = {
      agent,
      executionId,
      rentalId,
      equipmentCode: target.equipmentCode ?? null,
      correlationId: rentalId ?? (target as { correlationId: string }).correlationId,
      scope: () => {
        if (!rentalId) return Promise.reject(new Error('This tool can only be used inside a rental workflow'));
        return (scope ??= getRentalScope(rentalId));
      },
    };
  }

  /** JSON-schema specs of the given tools, for the LLM. */
  specs(toolNames: readonly string[]): ToolSpec[] {
    return toolNames.map((name) => {
      const tool = getTool(name);
      if (!tool) throw new Error(`Unknown tool ${name}`);
      const { $schema: _ignored, ...parameters } = z.toJSONSchema(tool.parameters) as Record<string, unknown>;
      return { name, description: tool.description, parameters };
    });
  }

  /**
   * @param restrictTo optional narrower allowlist for this call — e.g. during the LLM's
   *   information-gathering phase only read tools are offered, even if the agent may write.
   */
  async call(name: string, rawArgs: unknown, source: ToolCallSource, restrictTo?: readonly string[]): Promise<ToolOutcome> {
    const started = Date.now();
    const args = (rawArgs ?? {}) as Prisma.InputJsonValue;
    const record = (status: 'SUCCESS' | 'ERROR' | 'DENIED', extra: { result?: unknown; errorMessage?: string }) =>
      recordToolCall({
        executionId: this.ctx.executionId,
        toolName: name,
        source,
        arguments: args,
        result: extra.result === undefined ? undefined : toJson(extra.result),
        status,
        errorMessage: extra.errorMessage,
        durationMs: Date.now() - started,
      });

    // 1. Permission
    const tool = getTool(name);
    const permitted = tool && isToolAllowed(this.ctx.agent, name) && (!restrictTo || restrictTo.includes(name));
    if (!permitted) {
      const error = !tool
        ? `Tool "${name}" does not exist`
        : !isToolAllowed(this.ctx.agent, name)
          ? `Tool "${name}" is not permitted for the ${this.ctx.agent} agent`
          : `Tool "${name}" is not available in this phase (read-only tools only)`;
      await record('DENIED', { errorMessage: error });
      await writeAuditLog({
        actorType: 'AGENT',
        actorId: this.ctx.agent,
        action: 'tool.denied',
        entityType: 'AgentExecution',
        entityId: this.ctx.executionId,
        correlationId: this.ctx.correlationId,
        metadata: { tool: name, source },
      });
      return { ok: false, error };
    }

    // 2. Validation — unknown keys are stripped (context-scoped tools ignore invented ids)
    const parsed = tool.parameters.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      const error = `Invalid arguments: ${z.prettifyError(parsed.error)}`;
      await record('ERROR', { errorMessage: error });
      return { ok: false, error };
    }

    // 3. Execution
    try {
      const result = toJson(await tool.handler(parsed.data, this.ctx));
      await record('SUCCESS', { result });

      if (tool.kind === 'read') this.facts[name] = result;

      // 5. Automatic audit of side effects
      if (tool.kind === 'write' && tool.audit) {
        const entityId = (result as { id?: string } | null)?.id ?? this.ctx.rentalId ?? this.ctx.executionId;
        await writeAuditLog({
          actorType: 'AGENT',
          actorId: this.ctx.agent,
          action: tool.audit.action,
          entityType: tool.audit.entityType,
          entityId,
          correlationId: this.ctx.correlationId,
          after: toJson(parsed.data) as Prisma.InputJsonValue,
          metadata: { tool: name, executionId: this.ctx.executionId, source },
        });
      }
      return { ok: true, result };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      await record('ERROR', { errorMessage: error });
      return { ok: false, error };
    }
  }

  /** Like `call`, but throws — for agent-code actions that must succeed. */
  async run(name: string, args: Record<string, unknown>, source: ToolCallSource = 'AGENT'): Promise<unknown> {
    const outcome = await this.call(name, args, source);
    if (!outcome.ok) throw new Error(`${name} failed: ${outcome.error}`);
    return outcome.result;
  }
}

/** Normalises Prisma Decimals and Dates into plain JSON values. */
function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
