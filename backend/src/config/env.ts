import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  DATABASE_URL: z.string().min(1),
  PORT: z.coerce.number().default(3000),
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  LLM_PROVIDER: z.enum(['mock', 'openai-compatible']).default('mock'),
  LLM_BASE_URL: z.string().default('https://api.groq.com/openai/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('llama-3.3-70b-versatile'),
  // Model able to read images (document photos). Ollama: qwen2.5vl:3b
  LLM_VISION_MODEL: z.string().default('qwen2.5vl:3b'),
  // Generous default: local models on CPU can take tens of seconds per call.
  LLM_TIMEOUT_MS: z.coerce.number().default(120_000),
  // Proactive monitoring cycle interval. 0 disables the scheduler (the dashboard button still works).
  MONITORING_INTERVAL_MS: z.coerce.number().default(15 * 60_000),
  // Signs session tokens (HMAC-SHA256). The default is for local demos only — set your own elsewhere.
  AUTH_SECRET: z.string().min(16).default('dev-only-secret-change-me-please'),
  AUTH_TOKEN_TTL_HOURS: z.coerce.number().positive().default(12),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
