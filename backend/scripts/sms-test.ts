/**
 * Checks the SMS gateway configuration.
 *   npm run sms:test                       # shows provider and balance (free, sends nothing)
 *   npm run sms:test -- 258841234567       # also sends ONE test SMS to that number (costs 1 credit)
 */
import { env } from '../src/config/env.js';
import { normalizePhone, smsGateway, toSmsText } from '../src/sms/gateway.js';

const to = process.argv[2];
console.log(`SMS provider: ${smsGateway.name}${env.SMS_ALLOWLIST ? ` (allowlist: ${env.SMS_ALLOWLIST})` : ''}`);

if (smsGateway.name === 'simulated') {
  console.log('Simulated: nothing is sent. Set SMS_PROVIDER=mozesms and the MozeSMS keys in .env.');
} else {
  const b = await smsGateway.balance();
  console.log(`Balance: ${b.balance} ${b.currency} (~${b.smsRemaining} SMS)`);
  if (to) {
    const result = await smsGateway.send({ to, text: toSmsText('Teste de SMS do sistema RentOps. Se recebeu esta mensagem, o envio funciona.') });
    console.log(`Send to ${normalizePhone(to)}:`, result);
  }
}
