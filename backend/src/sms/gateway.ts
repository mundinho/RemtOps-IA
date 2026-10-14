import { env } from '../config/env.js';
import type { DeliveryResult } from '../email/gateway.js';

/**
 * SMS gateway — the second way notifications leave the system.
 *
 *   simulated → nothing is sent; the SMS is only stored
 *   mozesms   → MozeSMS (Mozambique), authenticated with X-API-Key + X-API-Secret
 *
 * Like the email gateway it never throws: the result (message id or error) is recorded on the
 * notification, so a gateway outage or an empty balance can never break an agent run.
 */

export interface OutgoingSms {
  /** Any format: "+258 84 123 4567", "841234567", "258841234567". */
  to: string;
  text: string;
}

export interface SmsGateway {
  readonly name: 'simulated' | 'mozesms';
  send(sms: OutgoingSms): Promise<DeliveryResult>;
  /** Account balance — used by the test script, costs nothing. */
  balance(): Promise<{ balance: number; currency: string; smsRemaining: number }>;
}

/** International digits only, as MozeSMS expects: "+258 84 123 4567" / "841234567" → "258841234567". */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return /^8\d{8}$/.test(digits) ? `258${digits}` : digits; // bare Mozambican mobile → add 258
}

const allowlist = new Set(env.SMS_ALLOWLIST.split(',').map((n) => normalizePhone(n)).filter(Boolean));

class SimulatedSmsGateway implements SmsGateway {
  readonly name = 'simulated' as const;
  async send(): Promise<DeliveryResult> {
    return { status: 'SIMULATED' };
  }
  async balance() {
    return { balance: 0, currency: 'MZN', smsRemaining: 0 };
  }
}

interface MozeSmsResponse {
  success?: boolean;
  error?: string;
  message?: string;
  data?: { id?: string; balance?: number; currency?: string; sms_credits?: number };
}

class MozeSmsGateway implements SmsGateway {
  readonly name = 'mozesms' as const;

  constructor() {
    if (!env.MOZESMS_API_KEY || !env.MOZESMS_API_SECRET) {
      throw new Error('SMS_PROVIDER=mozesms needs MOZESMS_API_KEY and MOZESMS_API_SECRET');
    }
  }

  private async call(path: string, init: RequestInit = {}): Promise<{ status: number; body: MozeSmsResponse }> {
    const response = await fetch(`${env.MOZESMS_BASE_URL.replace(/\/$/, '')}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': env.MOZESMS_API_KEY,
        'X-API-Secret': env.MOZESMS_API_SECRET,
      },
      signal: AbortSignal.timeout(15_000),
    });
    const body = (await response.json().catch(() => ({}))) as MozeSmsResponse;
    return { status: response.status, body };
  }

  async send(sms: OutgoingSms): Promise<DeliveryResult> {
    const phone = normalizePhone(sms.to);
    if (allowlist.size && !allowlist.has(phone)) return { status: 'SIMULATED' }; // not on the allowlist
    try {
      const { status, body } = await this.call('/sms/send', {
        method: 'POST',
        body: JSON.stringify({ phone, message: sms.text, ...(env.SMS_SENDER_ID && { sender_id: env.SMS_SENDER_ID }) }),
      });
      if (body.success && body.data?.id) return { status: 'SENT', messageId: body.data.id, sentAt: new Date() };
      return { status: 'FAILED', error: `MozeSMS ${status}: ${body.error ?? body.message ?? 'unknown error'}` };
    } catch (e) {
      return { status: 'FAILED', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async balance() {
    const { status, body } = await this.call('/account/balance');
    if (!body.success || !body.data) throw new Error(`MozeSMS ${status}: ${body.error ?? 'could not read the balance'}`);
    return { balance: body.data.balance ?? 0, currency: body.data.currency ?? 'MZN', smsRemaining: body.data.sms_credits ?? 0 };
  }
}

export const smsGateway: SmsGateway = env.SMS_PROVIDER === 'mozesms' ? new MozeSmsGateway() : new SimulatedSmsGateway();

/**
 * Turns a notification into one cheap SMS: GSM-7 only (accents removed — an "ã" would switch the
 * whole message to Unicode and halve its length) and at most 160 characters (one credit).
 */
export function toSmsText(subject: string, link?: string): string {
  const gsm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[–—]/g, '-')
      .replace(/[’‘]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/→/g, '->')
      .replace(/[^\x20-\x7E\n]/g, '');
  const tail = link ? ` ${gsm(link)}` : '';
  const head = `RentOps: ${gsm(subject)}`;
  const room = 160 - tail.length;
  return (head.length > room ? `${head.slice(0, room - 3).trimEnd()}...` : head) + tail;
}
