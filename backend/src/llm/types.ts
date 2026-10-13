/**
 * Provider-agnostic LLM contract.
 *
 * Agents depend only on these types, never on a vendor SDK — so switching between
 * Ollama (local), Groq/OpenRouter (cloud) or the Mock is a configuration change.
 */

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string; /** data: URLs of images, for vision models */ images?: string[] }
  | { role: 'assistant'; content: string | null; toolCalls?: ToolCallRequest[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

/** A tool the model is allowed to call. `parameters` is a JSON Schema object. */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/** The model asking us to run a tool. We execute it — the model never touches data directly. */
export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
  /** Set when the model produced arguments that are not valid JSON. */
  parseError?: string;
}

export interface ChatRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  temperature?: number;
  maxTokens?: number;
  /** Ask the model to answer with a single JSON object (used for structured decisions). */
  responseFormat?: 'json';
  /** Override the configured model for this call (e.g. the vision model for document photos). */
  model?: string;
  /** Which agent is calling. Used for logging and by the Mock provider. */
  agent?: string;
}

export interface ChatResponse {
  content: string | null;
  toolCalls: ToolCallRequest[];
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  chat(request: ChatRequest): Promise<ChatResponse>;
}

export class LLMError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = 'LLMError';
  }
}
