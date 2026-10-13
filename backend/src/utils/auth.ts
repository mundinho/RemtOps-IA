import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import type { UserRole } from '@prisma/client';
import { env } from '../config/env.js';

/**
 * Passwords and session tokens with Node's own crypto — no extra dependencies.
 *   - passwords: scrypt with a random salt, stored as "salt:hash" (hex)
 *   - tokens: a minimal signed token (JWT-like): base64url(payload).base64url(HMAC-SHA256)
 */

const scryptAsync = promisify(scrypt) as (password: string, salt: Buffer, keylen: number) => Promise<Buffer>;
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scryptAsync(password, salt, KEY_LENGTH);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  const [saltHex, hashHex] = stored?.split(':') ?? [];
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = await scryptAsync(password, Buffer.from(saltHex, 'hex'), expected.length);
  return timingSafeEqual(actual, expected);
}

/** Staff use the dashboard; customers use the portal. A token is valid for one side only. */
export type Session = { kind: 'staff'; sub: string; role: UserRole } | { kind: 'customer'; sub: string };

type TokenPayload = Session & { exp: number };

const sign = (data: string) => createHmac('sha256', env.AUTH_SECRET).update(data).digest('base64url');

export function signToken(session: Session): { token: string; expiresAt: string } {
  const exp = Date.now() + env.AUTH_TOKEN_TTL_HOURS * 3_600_000;
  const body = Buffer.from(JSON.stringify({ ...session, exp } satisfies TokenPayload)).toString('base64url');
  return { token: `${body}.${sign(body)}`, expiresAt: new Date(exp).toISOString() };
}

/** Returns the session, or null when the token is malformed, tampered with or expired. */
export function verifyToken(token: string): Session | null {
  const [body, signature] = token.split('.');
  if (!body || !signature) return null;
  const expected = Buffer.from(sign(body));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const { exp, ...session } = JSON.parse(Buffer.from(body, 'base64url').toString()) as TokenPayload;
    return exp > Date.now() ? (session as Session) : null;
  } catch {
    return null;
  }
}
