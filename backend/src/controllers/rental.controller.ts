import type { Request, Response } from 'express';
import { IdParam, RentalListQuery } from '../models/schemas.js';
import { getRental, listRentals } from '../services/rental.service.js';

export async function list(req: Request, res: Response) {
  res.json(await listRentals(RentalListQuery.parse(req.query)));
}

export async function detail(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  res.json(await getRental(id));
}
