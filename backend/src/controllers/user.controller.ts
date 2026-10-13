import type { Request, Response } from 'express';
import { staffOf } from '../middleware/auth.js';
import { IdParam, UserInputSchema, UserUpdateSchema } from '../models/schemas.js';
import { getStaffUser } from '../services/auth.service.js';
import { createUser, listUsers, updateUser } from '../services/user.service.js';

/** Staff accounts — admin only (enforced in the router). */

export async function list(_req: Request, res: Response) {
  res.json(await listUsers());
}

export async function create(req: Request, res: Response) {
  const actor = await getStaffUser(staffOf(res).sub);
  res.status(201).json(await createUser(UserInputSchema.parse(req.body), actor.email));
}

export async function update(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  const actor = await getStaffUser(staffOf(res).sub);
  res.json(await updateUser(id, UserUpdateSchema.parse(req.body), actor));
}
