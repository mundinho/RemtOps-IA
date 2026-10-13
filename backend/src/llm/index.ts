import { env } from '../config/env.js';
import { MockProvider } from './mock.provider.js';
import { OpenAICompatibleProvider } from './openaiCompatible.provider.js';
import type { LLMProvider } from './types.js';

function createProvider(): LLMProvider {
  if (env.LLM_PROVIDER === 'mock') return new MockProvider();

  return new OpenAICompatibleProvider({
    baseUrl: env.LLM_BASE_URL.replace(/\/$/, ''),
    apiKey: env.LLM_API_KEY,
    model: env.LLM_MODEL,
    timeoutMs: env.LLM_TIMEOUT_MS,
  });
}

export const llm: LLMProvider = createProvider();
export * from './types.js';
