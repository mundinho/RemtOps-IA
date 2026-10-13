import type { UserRole } from '@prisma/client';
import type { NextFunction, Request, Response } from 'express';
import { prisma } from '../database/prisma.js';
import { verifyToken, type Session } from '../utils/auth.js';
import { AppError } from '../utils/errors.js';

/**
 * Route guards. The token says who you are; the database is checked on every request,
 * so a deactivated user or a rejected customer account loses access immediately.
 */

export type StaffSession = Extract<Session, { kind: 'staff' }>;
export type CustomerSession = Extract<Session, { kind: 'customer' }>;

function readSession(req: Request): Session | null {
  const header = req.headers.authorization;
  return header?.startsWith('Bearer ') ? verifyToken(header.slice(7)) : null;
}

const unauthorized = () => new AppError(401, 'Sign in required');

/** Dashboard routes. With roles, only those roles get through (e.g. user management → ADMIN). */
export function requireStaff(...roles: UserRole[]) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const session = readSession(req);
    if (session?.kind !== 'staff') throw unauthorized();

    const user = await prisma.user.findUnique({ where: { id: session.sub }, select: { isActive: true, role: true } });
    if (!user?.isActive) throw unauthorized();
    if (roles.length && !roles.includes(user.role)) throw new AppError(403, 'Your role does not allow this action');

    res.locals.session = { ...session, role: user.role } satisfies StaffSession;
    next();
  };
}

/** Customer portal routes: only an ACTIVE account (validated by the Onboarding Agent). */
export async function requireCustomer(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req);
  if (session?.kind !== 'customer') throw unauthorized();

  const customer = await prisma.customer.findUnique({ where: { id: session.sub }, select: { accountStatus: true } });
  if (customer?.accountStatus !== 'ACTIVE') throw unauthorized();

  res.locals.session = session satisfies CustomerSession;
  next();
}

/** Public routes that behave better for a signed-in customer (e.g. the QR form). Never fails. */
export async function optionalCustomer(req: Request, res: Response, next: NextFunction) {
  const session = readSession(req);
  if (session?.kind === 'customer') {
    const customer = await prisma.customer.findUnique({ where: { id: session.sub }, select: { accountStatus: true } });
    if (customer?.accountStatus === 'ACTIVE') res.locals.session = session;
  }
  next();
}

export const staffOf = (res: Response) => res.locals.session as StaffSession;
export const customerOf = (res: Response) => res.locals.session as CustomerSession | undefined;
