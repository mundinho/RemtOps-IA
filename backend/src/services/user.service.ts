import { prisma } from '../database/prisma.js';
import type { UserInput, UserUpdate } from '../models/schemas.js';
import { hashPassword } from '../utils/auth.js';
import { AppError, notFound } from '../utils/errors.js';
import { writeAuditLog } from './audit.service.js';
import { publicUser } from './auth.service.js';

/** Staff accounts (dashboard → Users), managed by an admin. Passwords are never returned. */

export async function listUsers() {
  const users = await prisma.user.findMany({ orderBy: [{ isActive: 'desc' }, { name: 'asc' }] });
  return users.map(publicUser);
}

export async function createUser(input: UserInput, actor: string) {
  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new AppError(409, `${input.email} already has an account`, { email: ['Already registered'] });
  }
  const user = await prisma.user.create({
    data: { name: input.name, email: input.email, role: input.role, passwordHash: await hashPassword(input.password) },
  });
  await writeAuditLog({
    actorType: 'USER',
    actorId: actor,
    action: 'user.created',
    entityType: 'User',
    entityId: user.id,
    after: { name: user.name, email: user.email, role: user.role },
  });
  return publicUser(user);
}

export async function updateUser(id: string, input: UserUpdate, actor: { id: string; email: string }) {
  const before = await prisma.user.findUnique({ where: { id } });
  if (!before) throw notFound('User');

  // An admin cannot lock themselves out (and the system always keeps an active admin).
  if (id === actor.id && (input.isActive === false || (input.role && input.role !== 'ADMIN'))) {
    throw new AppError(400, 'You cannot deactivate or demote your own account');
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      role: input.role,
      isActive: input.isActive,
      passwordHash: input.password ? await hashPassword(input.password) : undefined,
    },
  });
  await writeAuditLog({
    actorType: 'USER',
    actorId: actor.email,
    action: 'user.updated',
    entityType: 'User',
    entityId: id,
    before: { role: before.role, isActive: before.isActive },
    after: { role: user.role, isActive: user.isActive, passwordReset: !!input.password },
  });
  return publicUser(user);
}
