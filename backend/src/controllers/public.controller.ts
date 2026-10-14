import type { Request, Response } from 'express';
import { answerCustomer } from '../agents/assistant/CustomerAssistant.js';
import { prisma } from '../database/prisma.js';
import { eventBus } from '../events/eventBus.js';
import { customerOf } from '../middleware/auth.js';
import { AssistantChatSchema, EquipmentCodeParam, IdParam, MpesaPaymentSchema, RentalRequestSchema } from '../models/schemas.js';
import { AppError } from '../utils/errors.js';
import { listCustomers } from '../services/customer.service.js';
import { getPublicEquipment } from '../services/equipment.service.js';
import { getMpesaDeposit, payDepositWithMpesa } from '../services/mpesa.service.js';
import { createRentalRequest, getRequestStatus } from '../services/rental.service.js';

/** Endpoints reached by scanning a physical QR code. */

export async function equipment(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  res.json(await getPublicEquipment(code));
}

export async function createRequest(req: Request, res: Response) {
  const { code } = EquipmentCodeParam.parse(req.params);
  const input = RentalRequestSchema.parse(req.body);

  // Signed-in customer: the company is the account's, whatever the form says.
  const session = customerOf(res);
  if (session) {
    const customer = await prisma.customer.findUniqueOrThrow({ where: { id: session.sub }, select: { taxId: true, companyName: true } });
    Object.assign(input, customer);
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
  const [request, mpesa] = await Promise.all([getRequestStatus(id), getMpesaDeposit(id)]);
  res.json({ ...request, mpesa });
}

/** Pays the rental's deposit with M-Pesa. Waits while the customer confirms with their PIN (up to ~2 min). */
export async function payMpesa(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  const { phone } = MpesaPaymentSchema.parse(req.body);
  res.json(await payDepositWithMpesa(id, phone));
}
