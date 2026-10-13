import type { Prisma } from '@prisma/client';

/** Prisma serialises Decimal as a string; the API exposes plain numbers. */
export function toNumber(value: Prisma.Decimal | null | undefined): number | null {
  return value == null ? null : Number(value);
}

/** "25 000 MZN" — used in agent messages and rule explanations. */
export function formatMzn(value: number): string {
  return `${Math.round(value).toLocaleString('en-US').replace(/,/g, ' ')} MZN`;
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
