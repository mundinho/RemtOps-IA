import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../config/env.js';

/**
 * Email gateway — how notifications leave the system.
 *
 *   simulated → nothing is sent; the notification is only stored (offline demos, tests)
 *   smtp      → any SMTP server; switching provider is a change in .env, not in code
 *
 * The gateway never throws: a delivery failure is returned and recorded on the notification,
 * so an unreachable mail server can never break an agent run.
 */

export interface OutgoingEmail {
  to: string;
  subject: string;
  /** Plain text; the HTML version is derived from it. */
  text: string;
}

export type DeliveryResult =
  | { status: 'SIMULATED' }
  | { status: 'SENT'; messageId: string; sentAt: Date }
  | { status: 'FAILED'; error: string };

export interface EmailGateway {
  readonly name: 'simulated' | 'smtp';
  send(email: OutgoingEmail): Promise<DeliveryResult>;
  /** Checks the connection and credentials (used by the test script). */
  verify(): Promise<void>;
}

class SimulatedGateway implements EmailGateway {
  readonly name = 'simulated' as const;
  async send(): Promise<DeliveryResult> {
    return { status: 'SIMULATED' };
  }
  async verify() {}
}

class SmtpGateway implements EmailGateway {
  readonly name = 'smtp' as const;
  private readonly transport: Transporter;

  constructor() {
    if (!env.SMTP_HOST) throw new Error('EMAIL_PROVIDER=smtp needs SMTP_HOST (and usually SMTP_USER / SMTP_PASS)');
    this.transport = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE ?? env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
      // Fail fast: agents wait for the result
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }

  async send(email: OutgoingEmail): Promise<DeliveryResult> {
    try {
      const info = await this.transport.sendMail({
        from: env.EMAIL_FROM,
        to: email.to,
        subject: email.subject,
        text: email.text,
        html: toHtml(email.subject, email.text),
      });
      return { status: 'SENT', messageId: info.messageId, sentAt: new Date() };
    } catch (e) {
      return { status: 'FAILED', error: e instanceof Error ? e.message : String(e) };
    }
  }

  async verify() {
    await this.transport.verify();
  }
}

export const emailGateway: EmailGateway = env.EMAIL_PROVIDER === 'smtp' ? new SmtpGateway() : new SimulatedGateway();

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** A simple branded HTML version of the text body (the agents write plain text). */
function toHtml(subject: string, text: string): string {
  const paragraphs = escapeHtml(text)
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');
  return `<!doctype html>
<html><body style="margin:0;background:#f1f5f9;font-family:Segoe UI,Arial,sans-serif;color:#0f172a">
  <div style="max-width:560px;margin:0 auto;padding:24px 16px">
    <div style="background:#0f172a;color:#fff;border-radius:12px 12px 0 0;padding:14px 20px;font-weight:600">
      <span style="display:inline-block;background:#fbbf24;color:#0f172a;border-radius:6px;padding:2px 8px;margin-right:8px">RentOps</span>
      Equipment Rental
    </div>
    <div style="background:#fff;border-radius:0 0 12px 12px;padding:20px;font-size:14px;line-height:1.55">
      <h1 style="font-size:16px;margin:0 0 14px">${escapeHtml(subject)}</h1>
      ${paragraphs}
    </div>
    <p style="font-size:11px;color:#64748b;text-align:center;margin-top:14px">
      Sent automatically by the RentOps AI agents.
    </p>
  </div>
</body></html>`;
}
