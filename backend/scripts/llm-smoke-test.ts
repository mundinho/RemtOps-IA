/**
 * Smoke test for the LLM integration: one tool-calling round trip against real data.
 *   npx tsx scripts/llm-smoke-test.ts [EQP-002]
 *
 * Note: this script reads Prisma directly only to keep the test self-contained.
 * Real agents go through Tool → Service → Database.
 */
import { prisma } from '../src/database/prisma.js';
import { llm, type ChatMessage, type ToolSpec } from '../src/llm/index.js';

const code = process.argv[2] ?? 'EQP-002';

// Context-scoped tool: the model decides WHICH tool to use, not WHICH entity it acts on.
// The equipment comes from the workflow context (here, argv), so a hallucinated id
// (small models wrote "EKP-002" for "EQP-002") can never hit the wrong record.
const tools: ToolSpec[] = [
  {
    name: 'getEquipment',
    description: 'Get details (status, maintenance dates) of the equipment in the current rental request.',
    parameters: { type: 'object', properties: {} },
  },
];

const messages: ChatMessage[] = [
  {
    role: 'system',
    content:
      `You are a Maintenance Agent. Today is ${new Date().toISOString().slice(0, 10)}. ` +
      'Use the tools to fetch data. Never invent data. Answer in one short paragraph.',
  },
  { role: 'user', content: `Can equipment ${code} be rented safely today? Check its maintenance status.` },
];

const time = async <T>(label: string, fn: () => Promise<T>) => {
  const start = Date.now();
  const result = await fn();
  console.log(`  (${label}: ${((Date.now() - start) / 1000).toFixed(1)}s)`);
  return result;
};

console.log(`Provider: ${llm.name} / ${llm.model}\n`);

const first = await time('call 1', () => llm.chat({ messages, tools, agent: 'MAINTENANCE' }));
const call = first.toolCalls[0];
if (!call) {
  console.log('Model did not call a tool. Answer:', first.content);
  process.exit(1);
}
console.log(`1. Model chose tool → ${call.name}(${JSON.stringify(call.arguments)})  [scoped to ${code}]`);

const equipment = await prisma.equipment.findUnique({
  where: { code },
  select: { code: true, name: true, status: true, lastMaintenanceAt: true, nextMaintenanceDue: true },
});
console.log('2. Tool result →', JSON.stringify(equipment));

messages.push(
  { role: 'assistant', content: first.content, toolCalls: first.toolCalls },
  { role: 'tool', toolCallId: call.id, name: call.name, content: JSON.stringify(equipment ?? { error: 'not found' }) },
);

const second = await time('call 2', () => llm.chat({ messages, tools, agent: 'MAINTENANCE' }));
console.log('3. Model conclusion →', second.content);

await prisma.$disconnect();
