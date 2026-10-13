import type { ChatRequest, ChatResponse, LLMProvider } from './types.js';

/**
 * A scripted stand-in for a real model — for offline demos and deterministic tests.
 *
 * It behaves like a cooperative LLM: in the tool phase it calls every tool it is offered,
 * in the decision phase it returns a benign, well-formed assessment. Everything around it
 * (permissions, rules, policy guard, audit) runs exactly as with a real model, so the
 * deterministic scenarios produce the same outcomes.
 */
export class MockProvider implements LLMProvider {
  readonly name = 'mock';
  readonly model = 'mock-planner';

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const base = { model: this.model, usage: { inputTokens: 0, outputTokens: 0 } };

    if (request.responseFormat === 'json') {
      return { ...base, content: JSON.stringify(MOCK_JUDGEMENT), toolCalls: [] };
    }

    const alreadyCalledTools = request.messages.some((m) => m.role === 'tool');
    if (!alreadyCalledTools && request.tools?.length) {
      return {
        ...base,
        content: null,
        toolCalls: request.tools.map((tool, i) => ({ id: `mock-${i}`, name: tool.name, arguments: {} })),
      };
    }
    if (request.agent === 'ASSISTANT') {
      const used = request.messages.filter((m) => m.role === 'tool').map((m) => (m as { name: string }).name);
      return { ...base, content: `(Mock assistant) I checked ${used.join(', ') || 'nothing'} for you. Ask me about availability, prices, documents or payment.`, toolCalls: [] };
    }
    return { ...base, content: 'DONE', toolCalls: [] };
  }
}

// A superset of fields; each agent's schema keeps only what it needs.
const MOCK_JUDGEMENT = {
  decision: 'PROCEED',
  confidence: 0.9,
  reasoning: 'Mock assessment: the facts provided raise no additional concern.',
  riskLevel: 'LOW',
  riskScore: 20,
  evidence: ['Mock model — no live reasoning'],
  safetyFlags: [],
  issues: [],
  recommendedAction: 'Review the case details and decide.',
  subject: 'Update on your rental request',
  body: 'Hello,\n\nThis is an update on your rental request. Please see the details in your account.\n\nRentOps',
};
