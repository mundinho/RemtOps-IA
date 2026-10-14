/**
 * Real M-Pesa test through the configured gateway (MPESA_PROVIDER).
 *   npm run mpesa:test                        # provider + merchant balance (no charge)
 *   npm run mpesa:test -- 845916612 1         # charges 1 MZN to that number — the phone gets a PIN prompt
 */
import { env } from '../src/config/env.js';
import { mpesaGateway } from '../src/payments/mpesa.js';
import { mpesaMsisdn } from '../src/services/mpesa.service.js';

const [phone, amountArg] = process.argv.slice(2);
console.log(`M-Pesa provider: ${mpesaGateway.name}${mpesaGateway.name === 'emedx' ? ` (${env.EMEDX_BASE_URL})` : ''}`);
if (mpesaGateway.balance) console.log('Merchant balance:', await mpesaGateway.balance());

if (phone) {
  const msisdn = mpesaMsisdn(phone);
  if (!msisdn) throw new Error('M-Pesa needs a Vodacom number (84 / 85)');
  const amount = Number(amountArg ?? 1);
  const ref = `TEST${Date.now().toString(36).toUpperCase()}`.slice(0, 20);
  console.log(`Charging ${amount} MZN to ${msisdn} (ref ${ref}) — confirm with the PIN on the phone…`);
  const started = Date.now();
  const result = await mpesaGateway.c2b({ msisdn, amount, transactionReference: ref, thirdPartyReference: ref });
  console.log(`Result after ${Math.round((Date.now() - started) / 1000)} s:`, result);
}
