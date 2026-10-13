import { z } from 'zod';
import { BUSINESS_RULES } from '../../config/businessRules.js';
import type { ToolSession } from '../../tools/toolExecutor.js';
import { neutraliseAccusations } from '../core/languageGuard.js';
import { judgeWithLLM, type LlmUsage } from '../core/llmSteps.js';
import { MonitoringAgent, type MonitoringReport } from '../core/MonitoringAgent.js';
import { confidenceField } from '../core/schemas.js';

interface PendingAnomaly {
  id: string;
  reason: string;
  recommendedAction: string;
  priority: string;
  analyzedData: unknown;
}

const Triage = z.object({
  decision: z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase().replace(/[\s-]/g, '_') : v), z.enum(['FOLLOW_UP', 'DISMISS'])),
  confidence: confidenceField,
  reasoning: z.string(),
});

/**
 * Approval Agent — monitoring mode: triages the anomaly cases the Risk Agent opened.
 *   FOLLOW_UP → the anomaly is real; its alert stays open on the dashboard
 *   DISMISS   → the data explains it; the case is closed
 * Conservative by design: if the AI is unsure or fails, the anomaly is kept (FOLLOW_UP) —
 * dismissing something real is the risky mistake, keeping it visible is not.
 */
export class AnomalyTriageMonitor extends MonitoringAgent {
  readonly name = 'APPROVAL' as const;
  readonly label = 'Approval Agent';

  protected async monitor(tools: ToolSession, usage: LlmUsage): Promise<MonitoringReport> {
    const pending = (await tools.run('getPendingAnomalies', {}, 'POLICY')) as PendingAnomaly[];
    let followUp = 0;
    let dismissed = 0;
    const notes: string[] = [];

    for (const anomaly of pending) {
      const judgement = await judgeWithLLM({
        agent: this.name,
        label: this.label,
        instructions:
          'Triage this anomaly flagged during monitoring. Choose FOLLOW_UP if the data shows a real issue that should stay on the operations radar, ' +
          'or DISMISS if the data clearly explains it and no action is needed. Describe data only — never accuse anyone. When unsure, choose FOLLOW_UP.',
        fields: '- "decision": "FOLLOW_UP" or "DISMISS"\n- "confidence": number between 0 and 1\n- "reasoning": one or two sentences',
        facts: { anomaly: anomaly.reason, suggestedAction: anomaly.recommendedAction, priority: anomaly.priority, data: anomaly.analyzedData },
        schema: Triage,
        usage,
      }).catch(() => null);

      // Only a confident DISMISS closes an anomaly; everything else keeps it visible.
      const dismiss = judgement?.decision === 'DISMISS' && judgement.confidence >= BUSINESS_RULES.minLlmConfidence;
      const text = neutraliseAccusations(judgement?.reasoning ?? 'No confident AI assessment — kept for follow-up (fail-safe).');
      if (text.replaced.length) notes.push(`Language guard neutralised "${text.replaced.join('", "')}".`);

      await tools.run('triageAnomaly', { caseId: anomaly.id, decision: dismiss ? 'DISMISS' : 'FOLLOW_UP', notes: text.text });
      if (dismiss) dismissed++;
      else followUp++;
    }

    return {
      findings: [],
      decision: 'NONE',
      summary: pending.length
        ? `Anomaly triage: ${pending.length} case(s) — ${followUp} kept for follow-up, ${dismissed} dismissed`
        : 'Anomaly triage: nothing pending',
      reasoning: notes.join('\n') || undefined,
    };
  }
}
