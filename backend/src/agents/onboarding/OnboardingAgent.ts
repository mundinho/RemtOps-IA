import type { AgentDecision, Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../database/prisma.js';
import { writeAuditLog } from '../../services/audit.service.js';
import { finishExecution, startExecution } from '../../services/agentExecution.service.js';
import { judgeWithLLM, LlmUsage } from '../core/llmSteps.js';
import { applyPolicyGuard, isTerminal } from '../core/policyGuard.js';
import { confidenceField } from '../core/schemas.js';
import { onboardingRules, type RegistrationFacts } from './rules.js';

const OnboardingJudgement = z.object({
  decision: z.preprocess((v) => {
    const s = typeof v === 'string' ? v.trim().toUpperCase() : v;
    return s === 'PROCEED' || s === 'APPROVED' || s === 'ACCEPT' ? 'APPROVE' : s === 'REJECTED' ? 'REJECT' : s;
  }, z.enum(['APPROVE', 'REJECT'])),
  confidence: confidenceField,
  reasoning: z.string(),
});

const LLM_DECISIONS: readonly AgentDecision[] = ['APPROVE', 'REJECT'];

/**
 * Onboarding Agent — validates every self-service customer registration (0% human).
 *
 *   1. RULES  — blocked NUIT, email different from the one on file, disposable email → REJECT
 *   2. JUDGE  — the LLM checks the data is plausible and consistent (company, contact, email, phone)
 *   3. GUARD  — rules win; the AI may only APPROVE or REJECT; low confidence or no answer → REJECT
 *   4. ACT    — the account becomes ACTIVE or REJECTED, with the reason, audited
 *
 * One AgentExecution per registration, so the decision shows up in Agent Activity like any other.
 */
export class OnboardingAgent {
  readonly name = 'ONBOARDING' as const;
  readonly label = 'Onboarding Agent';

  async run(customerId: string, facts: RegistrationFacts, trigger = 'customer.registered') {
    const execution = await startExecution({
      agent: this.name,
      correlationId: customerId,
      trigger,
      input: toJson({ customerId, ...facts }),
    });
    const usage = new LlmUsage();
    const notes: string[] = [];

    try {
      const violations = onboardingRules(facts);

      // Policy already decided — no AI needed
      let judgement: z.infer<typeof OnboardingJudgement> | null | undefined;
      if (!violations.some((v) => isTerminal(v.decision))) {
        try {
          judgement = await judgeWithLLM({
            agent: this.name,
            label: this.label,
            instructions:
              'A company wants to open a customer account to rent construction equipment in Mozambique. ' +
              'Check that the registration looks genuine and consistent: a real-looking company or person name, a real-looking contact name, ' +
              'an email that fits the company (a free provider like gmail is acceptable for small companies), and a plausible phone number. ' +
              'REJECT obvious test, fake or offensive data (e.g. "asdf", "test test", random letters). Otherwise APPROVE. ' +
              'If the NUIT already has a customer record, its company name should match the submitted one. Be conservative: when unsure, REJECT.',
            fields:
              '- "decision": "APPROVE" or "REJECT"\n' +
              '- "confidence": number between 0 and 1\n' +
              '- "reasoning": one or two sentences citing the data',
            facts,
            schema: OnboardingJudgement,
            usage,
          });
        } catch (e) {
          notes.push(`LLM judgement failed: ${(e as Error).message}`);
          judgement = null;
        }
      }

      const guard = applyPolicyGuard({ violations, judgement, llmDecisions: LLM_DECISIONS, escalateOnMissingJudgement: true });
      // Fail-safe: anything short of a clear APPROVE (including "escalate") rejects the account.
      const approved = guard.decision === 'APPROVE' || guard.decision === 'PROCEED';
      const decision: AgentDecision = approved ? 'APPROVE' : 'REJECT';
      const reason = approved
        ? judgement?.reasoning || 'Registration data is consistent.'
        : guard.reasons.join(' ') || judgement?.reasoning || 'The registration could not be validated.';

      await prisma.$transaction(async (tx) => {
        // A rejected claim on an existing company must not leave the claimant's credentials on its record.
        const dropCredentials = !approved && facts.existingRecord ? { loginEmail: null, passwordHash: null } : {};
        await tx.customer.update({
          where: { id: customerId },
          data: { accountStatus: approved ? 'ACTIVE' : 'REJECTED', accountDecisionReason: reason, ...dropCredentials },
        });
        await writeAuditLog(
          {
            actorType: 'AGENT',
            actorId: this.name,
            action: approved ? 'customer.account_activated' : 'customer.account_rejected',
            entityType: 'Customer',
            entityId: customerId,
            correlationId: customerId,
            after: { accountStatus: approved ? 'ACTIVE' : 'REJECTED', reason },
          },
          tx,
        );
      });

      const summary = `${approved ? 'Account activated' : 'Account rejected'}: ${facts.submitted.companyName} (NUIT ${facts.submitted.taxId})`;
      await finishExecution(execution.id, execution.startedAt, {
        status: 'SUCCEEDED',
        decision,
        summary,
        reasoning: [judgement?.reasoning, ...guard.reasons, ...notes].filter(Boolean).join('\n'),
        confidence: judgement?.confidence ?? null,
        output: toJson({ violations, judgement: judgement ?? null, decision, reason }),
        usedLLM: usage.used,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        policyOverride: guard.policyOverride,
      });
      return { decision, reason };
    } catch (e) {
      // Fail-safe: a crash never activates an account.
      const error = e instanceof Error ? e.message : String(e);
      await prisma.customer
        .update({
          where: { id: customerId },
          data: {
            accountStatus: 'REJECTED',
            accountDecisionReason: 'The registration could not be validated. Please try again later.',
            ...(facts.existingRecord ? { loginEmail: null, passwordHash: null } : {}),
          },
        })
        .catch(() => undefined);
      await finishExecution(execution.id, execution.startedAt, {
        status: 'FAILED',
        decision: 'REJECT',
        summary: `Agent failed: ${error}`,
        error,
        usedLLM: usage.used,
        model: usage.model,
      });
      return { decision: 'REJECT' as const, reason: error };
    }
  }
}

export const onboardingAgent = new OnboardingAgent();

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value ?? null)) as Prisma.InputJsonValue;
}
