const LOCALE = 'en-GB';

const dateFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric' });
const dateTimeFmt = new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
const timeFmt = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
// Mozambican metical, written "25 000 MZN" (space as thousands separator, also for 4-digit amounts)
const groupThousands = (value: number) => Math.round(value).toLocaleString('en-US').replace(/,/g, ' ');

export const formatDate = (iso: string | null | undefined) => (iso ? dateFmt.format(new Date(iso)) : '—');
export const formatDateTime = (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '—');
export const formatTime = (iso: string | null | undefined) => (iso ? timeFmt.format(new Date(iso)) : '—');
export const formatMoney = (value: number | null | undefined) => (value == null ? '—' : `${groupThousands(value)} MZN`);

const DAY_MS = 86_400_000;

/** Whole days from today to the given date (negative = in the past). */
export function daysUntil(iso: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(iso);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / DAY_MS);
}

export function relativeDays(iso: string | null | undefined): string {
  if (!iso) return '';
  const days = daysUntil(iso);
  if (days === 0) return 'today';
  if (days > 0) return `in ${days} day${days === 1 ? '' : 's'}`;
  return `${-days} day${days === -1 ? '' : 's'} ago`;
}

export function inclusiveDays(startIso: string, endIso: string): number {
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS) + 1;
}

export const humanize = (value: string) => value.charAt(0) + value.slice(1).toLowerCase().replace(/_/g, ' ');
