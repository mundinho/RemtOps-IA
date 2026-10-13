import { PrismaClient } from '@prisma/client';

// Password hashes are left out of every query by default — so they can never reach an API response,
// an agent's facts or the LLM. Sign-in code asks for them explicitly (omit: { passwordHash: false }).
export const prisma = new PrismaClient({
  omit: { user: { passwordHash: true }, customer: { passwordHash: true } },
});
