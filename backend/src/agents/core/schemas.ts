import { z } from 'zod';

/**
 * Lenient parsers for LLM output. Small local models often answer "proceed" or 85
 * instead of "PROCEED" or 0.85 — we normalise the format, never the meaning.
 */

export const confidenceField = z.preprocess((value) => {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && n > 1 ? n / 100 : n;
}, z.number().min(0).max(1));

export const upperEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess((v) => (typeof v === 'string' ? v.trim().toUpperCase() : v), z.enum(values));

export const stringList = z.preprocess(
  (v) => (Array.isArray(v) ? v.map(String) : v == null || v === '' ? [] : [String(v)]),
  z.array(z.string()),
);
