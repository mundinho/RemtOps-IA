import type { Request, Response } from 'express';
import { prisma } from '../database/prisma.js';
import { seedDatabase } from '../database/seed.js';

/** Restores the demo dataset so the scenarios can be presented again. */
export async function reset(_req: Request, res: Response) {
  await seedDatabase(prisma);
  res.json({ status: 'reset' });
}
