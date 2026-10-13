import { randomUUID } from 'node:crypto';
import { LLMError, type ChatMessage, type ChatRequest, type ChatResponse, type LLMProvider, type ToolCallRequest } from './types.js';

interface ProviderConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  timeoutMs: number;
}

// Minimal subset of the OpenAI Chat Completions wire format that we need.
interface WireToolCall {
  id?: string;
  type: 'function';
  function: { name: string; arguments: string | Record<string, unknown> };
}

interface WireResponse {
  model?: string;
  choices: { message: { content: string | null; tool_calls?: WireToolCall[] } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/**
 * Talks to any server that implements the OpenAI Chat Completions API:
 * Ollama (http://localhost:11434/v1), Groq, OpenRouter, LM Studio, vLLM...
 * Plain fetch, no SDK — the whole integration fits in this file.
 */
export class OpenAICompatibleProvider implements LLMProvider {
  readonly name = 'openai-compatible';
  readonly model: string;

  constructor(private readonly config: ProviderConfig) {
    this.model = config.model;
  }

  async chat(request: ChatRequest): Promise<ChatResponse> {
    const body = {
      model: request.model ?? this.config.model,
      messages: request.messages.map(toWireMessage),
      tools: request.tools?.map((tool) => ({ type: 'function', function: tool })),
      temperature: request.temperature ?? 0,
      max_tokens: request.maxTokens,
      response_format: request.responseFormat === 'json' ? { type: 'json_object' } : undefined,
      stream: false,
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (error) {
      throw new LLMError(`LLM request failed (${this.config.baseUrl}): ${(error as Error).message}`, error);
    }

    if (!response.ok) {
      throw new LLMError(`LLM returned HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const data = (await response.json()) as WireResponse;
    const message = data.choices[0]?.message;
    if (!message) throw new LLMError('LLM response contained no choices');

    return {
      content: message.content || null,
      toolCalls: (message.tool_calls ?? []).map(fromWireToolCall),
      model: data.model ?? this.config.model,
      usage: {
        inputTokens: data.usage?.prompt_tokens ?? 0,
        outputTokens: data.usage?.completion_tokens ?? 0,
      },
    };
  }
}

function toWireMessage(message: ChatMessage) {
  switch (message.role) {
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: message.toolCalls?.map((call) => ({
          id: call.id,
          type: 'function',
          function: { name: call.name, arguments: JSON.stringify(call.arguments) },
        })),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, name: message.name, content: message.content };
    case 'user':
      if (!message.images?.length) return { role: 'user', content: message.content };
      return {
        role: 'user',
        content: [
          { type: 'text', text: message.content },
          ...message.images.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      };
    default:
      return message;
  }
}

function fromWireToolCall(call: WireToolCall): ToolCallRequest {
  const base = { id: call.id || randomUUID(), name: call.function.name };
  const raw = call.function.arguments;

  if (typeof raw !== 'string') return { ...base, arguments: raw ?? {} };
  if (raw.trim() === '') return { ...base, arguments: {} };

  try {
    return { ...base, arguments: JSON.parse(raw) as Record<string, unknown> };
  } catch {
    // Small local models occasionally emit malformed JSON. We surface it instead of guessing,
    // so the agent loop can report the error back to the model (or escalate).
    return { ...base, arguments: {}, parseError: `Invalid JSON arguments: ${raw.slice(0, 200)}` };
  }
}
