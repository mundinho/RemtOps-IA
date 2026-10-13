import { reactive } from 'vue';
import type { StaffUser } from '@/types';

/**
 * The signed-in identity, one per side: staff use the dashboard, customers use the portal.
 * Kept in localStorage so a refresh keeps you signed in; the API re-checks the token on every call.
 */

interface StaffSession {
  token: string;
  expiresAt: string;
  user: StaffUser;
}

interface CustomerSession {
  token: string;
  expiresAt: string;
  customer: { id: string; code: string; companyName: string };
}

const KEYS = { staff: 'rentops.staff', customer: 'rentops.customer' } as const;

function load<T extends { expiresAt: string }>(key: string): T | null {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null') as T | null;
    return value && new Date(value.expiresAt) > new Date() ? value : null;
  } catch {
    return null;
  }
}

function save(key: string, value: unknown) {
  try {
    if (value) localStorage.setItem(key, JSON.stringify(value));
    else localStorage.removeItem(key);
  } catch {
    // Storage blocked (private mode): the session simply lasts until the tab closes.
  }
}

export const session = reactive({
  staff: load<StaffSession>(KEYS.staff),
  customer: load<CustomerSession>(KEYS.customer),
});

export function setStaff(value: StaffSession | null) {
  session.staff = value;
  save(KEYS.staff, value);
}

export function setCustomer(value: CustomerSession | null) {
  session.customer = value;
  save(KEYS.customer, value);
}

export const isAdmin = () => session.staff?.user.role === 'ADMIN';
