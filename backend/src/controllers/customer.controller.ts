import type { Request, Response } from 'express';
import { staffOf } from '../middleware/auth.js';
import { CustomerInputSchema, IdParam } from '../models/schemas.js';
import { getStaffUser } from '../services/auth.service.js';
import { createCustomer, listCustomers, updateCustomer } from '../services/customer.service.js';

/** Customer master data, maintained by staff. Decisions on rentals stay with the agents. */

export async function list(_req: Request, res: Response) {
  res.json(await listCustomers());
}

export async function create(req: Request, res: Response) {
  const actor = await getStaffUser(staffOf(res).sub);
  res.status(201).json(await createCustomer(CustomerInputSchema.parse(req.body), actor.email));
}

export async function update(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  const actor = await getStaffUser(staffOf(res).sub);
  res.json(await updateCustomer(id, CustomerInputSchema.parse(req.body), actor.email));
}
