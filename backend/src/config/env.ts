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

  // Email gateway. "simulated" stores notifications without sending anything (the default);
  // "smtp" delivers them through any SMTP server (Gmail app password, Outlook, Brevo, SendGrid, Mailtrap…).
  EMAIL_PROVIDER: z.enum(['simulated', 'smtp']).default('simulated'),
  SMTP_HOST: z.string().default(''),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  // true = TLS from the start (port 465); false = STARTTLS upgrade (port 587)
  SMTP_SECURE: z
    .enum(['true', 'false', ''])
    .default('')
    .transform((v) => (v === '' ? undefined : v === 'true')),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  EMAIL_FROM: z.string().default('RentOps <no-reply@rentops.local>'),
  // Optional: also email the operations notifications (otherwise they stay internal, in the dashboard).
  OPERATIONS_EMAIL: z.union([z.email(), z.literal('')]).default(''),

  // SMS gateway. "simulated" stores SMS without sending (the default); "mozesms" sends through MozeSMS
  // (https://api.mozesms.com, X-API-Key + X-API-Secret). Every SMS costs credits.
  SMS_PROVIDER: z.enum(['simulated', 'mozesms']).default('simulated'),
  MOZESMS_BASE_URL: z.string().default('https://api.mozesms.com'),
  MOZESMS_API_KEY: z.string().default(''),
  MOZESMS_API_SECRET: z.string().default(''),
  // Must be approved by MozeSMS; empty = their default sender ("MozeSMS").
  SMS_SENDER_ID: z.string().max(11).default(''),
  // Optional safety net: comma-separated numbers (e.g. 258841234567). When set, only these receive real
  // SMS — everyone else stays simulated (useful with demo data, whose numbers may belong to real people).
  SMS_ALLOWLIST: z.string().default(''),

  // M-Pesa (Vodacom Mozambique) C2B — the customer pays a deposit and confirms with their PIN.
  // "simulated" approves instantly without moving money (demos); "vodacom" charges for real.
  // "emedx" charges for real through the Emedx Pay gateway (no own M-Pesa account needed).
  MPESA_PROVIDER: z.enum(['simulated', 'vodacom', 'emedx']).default('simulated'),
  EMEDX_BASE_URL: z.string().default('https://api.payments.emedx.co.mz'),
  EMEDX_CLIENT_KEY: z.string().default(''),
  EMEDX_CLIENT_SECRET: z.string().default(''),
  MPESA_BASE_URL: z.string().default('https://api.vm.co.mz:18352'),
  MPESA_API_KEY: z.string().default(''),
  // Public key from the developer portal (base64, with or without PEM header). Encrypts the API key.
  MPESA_PUBLIC_KEY: z.string().default(''),
  // Organisation shortcode that receives the money (input_ServiceProviderCode).
  MPESA_SERVICE_PROVIDER_CODE: z.string().default(''),
  // Deposit charged by M-Pesa, as a share of the rental total; the rest is paid by other means.
  MPESA_DEPOSIT_PERCENT: z.coerce.number().min(1).max(100).default(10),
  // Optional cap per M-Pesa transaction (MZN). 0 = no cap.
  MPESA_MAX_AMOUNT: z.coerce.number().min(0).default(0),
});

const parsed = EnvSchema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:', z.flattenError(parsed.error).fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
