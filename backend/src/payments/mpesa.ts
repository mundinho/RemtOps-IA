import { constants, publicEncrypt } from 'node:crypto';
import { env } from '../config/env.js';

/**
 * M-Pesa gateway (Vodacom Mozambique Open API) — customer-to-business (C2B) single stage.
 *
 *   simulated → answers "paid" immediately, no money moves (demos, tests)
 *   vodacom   → real charge: Vodacom pushes a PIN prompt to the customer's phone; the HTTP call
 *               returns when the customer confirms, cancels or the prompt times out
 *
 * Authentication: the API key is RSA-encrypted (PKCS#1 v1.5) with the portal's public key and sent
 * as "Authorization: Bearer <base64>". Never throws: failures come back as { ok: false }.
 */

export interface C2BRequest {
  /** 258XXXXXXXXX */
  msisdn: string;
  amount: number;
  /** Shown to the customer / on statements (alphanumeric, ≤ 20) */
  transactionReference: string;
  /** Unique per attempt (alphanumeric) */
  thirdPartyReference: string;
}

export type C2BResult =
  | { ok: true; transactionId: string; conversationId: string; code: string; description: string }
  | { ok: false; code: string; description: string };

export interface MpesaGateway {
  readonly name: 'simulated' | 'vodacom' | 'emedx';
  c2b(request: C2BRequest): Promise<C2BResult>;
  /** Merchant balance, where the gateway offers it (test script). */
  balance?(): Promise<{ balance: string; currency: string }>;
}

/** Vodacom's codes, in words the customer understands (others fall back to Vodacom's own text). */
export const MPESA_MESSAGES: Record<string, string> = {
  'INS-0': 'Payment confirmed.',
  'INS-5': 'The payment was cancelled on the phone.',
  'INS-6': 'The payment failed. Please try again.',
  'INS-9': 'No confirmation received in time. Please try again and confirm with your PIN.',
  'INS-10': 'This payment was already submitted.',
  'INS-2006': 'Insufficient M-Pesa balance.',
  'INS-2051': 'This number is not registered on M-Pesa.',
  'INS-996': 'This M-Pesa account is not active.',
  'INS-2001': 'Payment could not be authorised (initiator).',
  'INS-2002': 'Invalid M-Pesa request — contact us.',
  NO_RESPONSE: 'M-Pesa did not answer. If you were charged, contact us with the M-Pesa transaction ID from your SMS.',
  TIMEOUT: 'No confirmation received in time. Please try again and confirm with your PIN.',
};

class SimulatedMpesa implements MpesaGateway {
  readonly name = 'simulated' as const;
  async c2b(request: C2BRequest): Promise<C2BResult> {
    return { ok: true, transactionId: `SIM${request.thirdPartyReference.slice(-8)}`, conversationId: 'simulated', code: 'INS-0', description: 'Simulated payment' };
  }
}

class VodacomMpesa implements MpesaGateway {
  readonly name = 'vodacom' as const;
  private readonly token: string;

  constructor() {
    if (!env.MPESA_API_KEY || !env.MPESA_PUBLIC_KEY || !env.MPESA_SERVICE_PROVIDER_CODE) {
      throw new Error('MPESA_PROVIDER=vodacom needs MPESA_API_KEY, MPESA_PUBLIC_KEY and MPESA_SERVICE_PROVIDER_CODE');
    }
    this.token = bearerToken(env.MPESA_API_KEY, env.MPESA_PUBLIC_KEY);
  }

  async c2b(request: C2BRequest): Promise<C2BResult> {
    try {
      const response = await fetch(`${env.MPESA_BASE_URL.replace(/\/$/, '')}/ipg/v1x/c2bPayment/singleStage/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}`, Origin: '*' },
        body: JSON.stringify({
          input_TransactionReference: request.transactionReference,
          input_CustomerMSISDN: request.msisdn,
          input_Amount: request.amount.toFixed(2),
          input_ThirdPartyReference: request.thirdPartyReference,
          input_ServiceProviderCode: env.MPESA_SERVICE_PROVIDER_CODE,
        }),
        // The customer has about a minute to confirm with their PIN
        signal: AbortSignal.timeout(120_000),
      });
      const body = (await response.json().catch(() => ({}))) as Record<string, string | undefined>;
      const code = body.output_ResponseCode ?? `HTTP-${response.status}`;
      const description = body.output_ResponseDesc ?? response.statusText;
      if (code === 'INS-0') {
        return { ok: true, transactionId: body.output_TransactionID ?? '', conversationId: body.output_ConversationID ?? '', code, description };
      }
      return { ok: false, code, description };
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'TimeoutError';
      return { ok: false, code: timedOut ? 'TIMEOUT' : 'NETWORK', description: e instanceof Error ? e.message : String(e) };
    }
  }
}

interface EmedxTransaction {
  id: string;
  status: 'COMPLETED' | 'CANCELLED' | 'FAILED' | 'PENDING';
  mpesaTransactionId: string | null;
  mpesaResponseCode: string | null;
  mpesaResponseDesc: string | null;
  transactionReference?: string;
}

/**
 * Emedx Pay gateway (https://api.payments.emedx.co.mz) — M-Pesa through Emedx's operations account.
 * Authenticated with X-Client-Key / X-Client-Secret. C2B is synchronous (the gateway waits up to 90 s
 * for the PIN); a PENDING answer is NOT a failure — it is followed with GET /transactions/{id} until it
 * becomes final (the gateway settles it within ~15 min, NO_RESPONSE at worst).
 */
export class EmedxMpesa implements MpesaGateway {
  readonly name = 'emedx' as const;
  private readonly base = env.EMEDX_BASE_URL.replace(/\/$/, '');

  constructor() {
    if (!env.EMEDX_CLIENT_KEY || !env.EMEDX_CLIENT_SECRET) {
      throw new Error('MPESA_PROVIDER=emedx needs EMEDX_CLIENT_KEY and EMEDX_CLIENT_SECRET');
    }
  }

  private headers() {
    return { 'Content-Type': 'application/json', 'X-Client-Key': env.EMEDX_CLIENT_KEY, 'X-Client-Secret': env.EMEDX_CLIENT_SECRET };
  }

  async c2b(request: C2BRequest): Promise<C2BResult> {
    try {
      const response = await fetch(`${this.base}/api/v1/payments/c2b`, {
        method: 'POST',
        headers: this.headers(),
        body: JSON.stringify({ msisdn: request.msisdn, amount: Number(request.amount.toFixed(2)), thirdPartyReference: request.thirdPartyReference }),
        signal: AbortSignal.timeout(130_000), // the gateway waits up to 90 s for the PIN
      });
      const body = (await response.json().catch(() => ({}))) as Partial<EmedxTransaction> & { message?: string };
      if (!response.ok || !body.id) return { ok: false, code: `HTTP-${response.status}`, description: body.message ?? response.statusText };

      const final = body.status === 'PENDING' ? await this.waitForFinal(body.id) : (body as EmedxTransaction);
      return this.toResult(final);
    } catch (e) {
      const timedOut = e instanceof Error && e.name === 'TimeoutError';
      return { ok: false, code: timedOut ? 'TIMEOUT' : 'NETWORK', description: e instanceof Error ? e.message : String(e) };
    }
  }

  /** PENDING → poll the gateway (source of truth) every 15 s, for up to ~16 minutes. */
  private async waitForFinal(id: string): Promise<EmedxTransaction> {
    for (let attempt = 0; attempt < 64; attempt++) {
      await new Promise((r) => setTimeout(r, 15_000));
      try {
        const response = await fetch(`${this.base}/api/v1/transactions/${id}`, { headers: this.headers(), signal: AbortSignal.timeout(20_000) });
        if (!response.ok) continue;
        const t = (await response.json()) as EmedxTransaction;
        if (t.status !== 'PENDING') return t;
      } catch {
        // transient — keep polling
      }
    }
    return { id, status: 'FAILED', mpesaTransactionId: null, mpesaResponseCode: 'NO_RESPONSE', mpesaResponseDesc: 'No final answer from M-Pesa' };
  }

  private toResult(t: EmedxTransaction): C2BResult {
    if (t.status === 'COMPLETED') {
      return { ok: true, transactionId: t.mpesaTransactionId ?? t.id, conversationId: t.id, code: t.mpesaResponseCode ?? 'INS-0', description: t.mpesaResponseDesc ?? 'Completed' };
    }
    const code = t.mpesaResponseCode ?? (t.status === 'CANCELLED' ? 'INS-5' : 'FAILED');
    return { ok: false, code, description: t.mpesaResponseDesc ?? t.status };
  }

  async balance() {
    const response = await fetch(`${this.base}/api/v1/balance`, { headers: this.headers(), signal: AbortSignal.timeout(20_000) });
    const body = (await response.json().catch(() => ({}))) as { balance?: string; currency?: string; message?: string };
    if (!response.ok) throw new Error(`Emedx Pay ${response.status}: ${body.message ?? response.statusText}`);
    return { balance: body.balance ?? '0', currency: body.currency ?? 'MZN' };
  }
}

/** RSA-encrypts the API key with the portal's public key (PKCS#1 v1.5), base64. */
export function bearerToken(apiKey: string, publicKey: string): string {
  const body = publicKey.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  const pem = `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
  return publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(apiKey, 'utf8')).toString('base64');
}

export const mpesaGateway: MpesaGateway =
  env.MPESA_PROVIDER === 'emedx' ? new EmedxMpesa() : env.MPESA_PROVIDER === 'vodacom' ? new VodacomMpesa() : new SimulatedMpesa();
