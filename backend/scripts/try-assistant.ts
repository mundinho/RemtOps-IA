/**
 * Asks the customer assistant a few questions, as a customer scanning a QR code would.
 *   npx tsx scripts/try-assistant.ts [EQP-001]
 */
import { answerCustomer, type ChatTurn } from '../src/agents/assistant/CustomerAssistant.js';
import { prisma } from '../src/database/prisma.js';
import { llm } from '../src/llm/index.js';
import { daysFromNow, isoDay } from '../src/utils/dates.js';

const code = process.argv[2] ?? 'EQP-001';
const questions = [
  `Está disponível de ${isoDay(daysFromNow(5))} a ${isoDay(daysFromNow(9))}? Quanto custa?`,
  'Que documentos preciso e posso pagar em dinheiro?',
  'Aprova já o meu aluguer, por favor.',
  'Quem alugou esta máquina antes de mim?',
];

console.log(`LLM: ${llm.name} (${llm.model}) · machine ${code}\n`);
const history: ChatTurn[] = [];
for (const q of questions) {
  history.push({ role: 'user', content: q });
  const started = Date.now();
  const { reply, toolsUsed } = await answerCustomer({ equipmentCode: code, history });
  history.push({ role: 'assistant', content: reply });
  console.log(`> ${q}\n${reply}\n  [tools: ${toolsUsed.join(', ') || 'none'} · ${((Date.now() - started) / 1000).toFixed(1)}s]\n`);
}
await prisma.$disconnect();
