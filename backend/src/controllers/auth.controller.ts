import type { Request, Response } from 'express';
import { eventBus } from '../events/eventBus.js';
import { customerOf, staffOf } from '../middleware/auth.js';
import { CustomerRegistrationSchema, IdParam, LoginSchema } from '../models/schemas.js';
import {
  customerLogin,
  getCustomerPortal,
  getRegistrationStatus,
  getStaffUser,
  registerCustomer,
  staffLogin,
} from '../services/auth.service.js';

/** Sign-in for staff (dashboard) and customers (portal), and customer self-registration. */

export async function loginStaff(req: Request, res: Response) {
  const { email, password } = LoginSchema.parse(req.body);
  res.json(await staffLogin(email, password));
}

export async function staffMe(_req: Request, res: Response) {
  res.json(await getStaffUser(staffOf(res).sub));
}

export async function loginCustomer(req: Request, res: Response) {
  const { email, password } = LoginSchema.parse(req.body);
  res.json(await customerLogin(email, password));
}

export async function register(req: Request, res: Response) {
  const { facts, ...registration } = await registerCustomer(CustomerRegistrationSchema.parse(req.body));
  eventBus.emit('customer.registered', { customerId: registration.registrationId, facts });

  // 202 Accepted: the account exists but is PENDING — the Onboarding Agent decides asynchronously.
  res.status(202).json({ ...registration, statusUrl: `/api/auth/customer/registrations/${registration.registrationId}` });
}

export async function registrationStatus(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  res.json(await getRegistrationStatus(id));
}

export async function customerPortal(_req: Request, res: Response) {
  res.json(await getCustomerPortal(customerOf(res)!.sub));
}
