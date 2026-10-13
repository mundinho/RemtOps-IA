import type { Request, Response } from 'express';
import { getOverview } from '../services/dashboard.service.js';
import { getStatistics } from '../services/statistics.service.js';

export async function overview(_req: Request, res: Response) {
  res.json(await getOverview());
}

export async function statistics(_req: Request, res: Response) {
  res.json(await getStatistics());
}
