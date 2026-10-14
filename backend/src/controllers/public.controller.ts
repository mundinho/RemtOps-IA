import type { Request, Response } from 'express';
import { answerCustomer } from '../agents/assistant/CustomerAssistant.js';
import { prisma } from '../database/prisma.js';
import { eventBus } from '../events/eventBus.js';
import { customerOf } from '../middleware/auth.js';
import { env } from '../config/env.js';
import { AssistantChatSchema, EquipmentCodeParam, IdParam, MpesaCheckoutSchema, RentalRequestSchema } from '../models/schemas.js';
import { AppError } from '../utils/errors.js';
import { listCustomers } from '../services/customer.service.js';
import { getPublicEquipment } from '../services/equipment.service.js';
import { getCheckout, getRentalDeposit, startCheckout } from '../services/mpesa.service.js';
import { createRentalRequest, getRequestStatus } from '../services/rental.service.js';

/** Endpoints reached by scanning a physical QR code. */

export async function equipment(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  // The form shows the M-Pesa deposit before paying
  res.json({ ...(await getPublicEquipment(code)), mpesa: { depositPercent: env.MPESA_DEPOSIT_PERCENT, maxAmount: env.MPESA_MAX_AMOUNT || null } });
}

/** Signed-in customer: the company is the account's, whatever the form says. */
async function withAccountCompany<T extends object>(res: Response, form: T): Promise<T> {
  const session = customerOf(res);
  if (!session) return form;
  const customer = await prisma.customer.findUniqueOrThrow({ where: { id: session.sub }, select: { taxId: true, companyName: true } });
  return { ...form, ...customer };
}

export async function createRequest(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  const input = await withAccountCompany(res, RentalRequestSchema.parse(req.body));
  // M-Pesa is paid before the request exists — those go through /mpesa-checkout.
  if (input.paymentMethod === 'MPESA') {
    throw new AppError(400, 'M-Pesa requests are paid first', { paymentMethod: ['Pay the deposit with M-Pesa to submit'] });
  }

  const request = await createRentalRequest(code, input);
  eventBus.emit('rental.requested', { rentalId: request.id });

  // 202 Accepted: the request is stored; the decision is taken asynchronously by the agents.
  res.status(202).json({ ...request, statusUrl: `/api/public/rental-requests/${request.id}` });
}

/** Customer assistant (chatbot) on the QR pages. Synchronous: the reply comes back in the response. */
export async function assistant(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  const { messages, rentalId } = AssistantChatSchema.parse(req.body);

  if (rentalId) {
    // The status page may only ask about its own request, for this machine.
    const rental = await prisma.rental.findUnique({ where: { id: rentalId }, select: { equipment: { select: { code: true } } } });
    if (!rental || rental.equipment.code !== code) throw new AppError(404, 'Rental request not found for this equipment');
  } else if (!(await prisma.equipment.findUnique({ where: { code }, select: { id: true } }))) {
    throw new AppError(404, `Equipment ${code} not found`);
  }

  res.json(await answerCustomer({ equipmentCode: code, rentalId, history: messages }));
}

/** Demo helper on the QR form: lets the presenter choose which seeded customer is "scanning". */
export async function demoCustomers(_req: Request, res: Response) {
  const customers = await listCustomers();
  res.json(
    customers.map(({ id, code, companyName, contactName, taxId, email, phone, country, isBlocked }) => ({
      id,
      code,
      companyName,
      contactName,
      taxId,
      email,
      phone,
      country,
      isBlocked,
    })),
  );
}

export async function requestStatus(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  const [request, mpesa] = await Promise.all([getRequestStatus(id), getRentalDeposit(id)]);
  res.json({ ...request, mpesa });
}

/**
 * M-Pesa checkout: validates the form, charges the deposit (PIN on the phone) and, once paid, creates
 * the rental request. Answers at once; the form polls the checkout until it is paid or failed.
 */
export async function mpesaCheckout(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  const { mpesaPhone, ...form } = MpesaCheckoutSchema.parse(req.body);
  res.status(202).json(await startCheckout(code, await withAccountCompany(res, form), mpesaPhone));
}

export async function checkoutStatus(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  res.json(await getCheckout(id));
}
