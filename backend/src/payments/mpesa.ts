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
  readonly name: 'simulated' | 'vodacom';
  c2b(request: C2BRequest): Promise<C2BResult>;
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

/** RSA-encrypts the API key with the portal's public key (PKCS#1 v1.5), base64. */
export function bearerToken(apiKey: string, publicKey: string): string {
  const body = publicKey.replace(/-----(BEGIN|END) PUBLIC KEY-----/g, '').replace(/\s+/g, '');
  const pem = `-----BEGIN PUBLIC KEY-----\n${body.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
  return publicEncrypt({ key: pem, padding: constants.RSA_PKCS1_PADDING }, Buffer.from(apiKey, 'utf8')).toString('base64');
}

export const mpesaGateway: MpesaGateway = env.MPESA_PROVIDER === 'vodacom' ? new VodacomMpesa() : new SimulatedMpesa();
