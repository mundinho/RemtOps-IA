const DAY_MS = 24 * 60 * 60 * 1000;

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function daysFromNow(days: number): Date {
  return new Date(startOfDay().getTime() + days * DAY_MS);
}

/** Inclusive day count: a rental from Mon to Mon is 1 day, Mon to Tue is 2 days. */
export function rentalDays(start: Date, end: Date): number {
  return Math.round((startOfDay(end).getTime() - startOfDay(start).getTime()) / DAY_MS) + 1;
}

/** YYYY-MM-DD in local time — compact and unambiguous for LLM prompts. */
export function isoDay(date: Date | null | undefined): string | null {
  return date ? date.toLocaleDateString('sv-SE') : null;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date): boolean {
  return aStart <= bEnd && bStart <= aEnd;
}
