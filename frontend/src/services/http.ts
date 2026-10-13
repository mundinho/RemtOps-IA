import { session, setCustomer, setStaff } from './session';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }
}

/** Which session a call belongs to: the customer portal and QR pages, or the staff dashboard. */
const sideOf = (path: string) => (path.startsWith('/portal') || path.startsWith('/public/') ? 'customer' : 'staff');

export async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const side = sideOf(path);
  const token = path.startsWith('/auth/') && path !== '/auth/staff/me' ? undefined : session[side]?.token;

  const response = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token && { Authorization: `Bearer ${token}` }), ...init?.headers },
  });

  const body = response.headers.get('content-type')?.includes('application/json') ? await response.json() : null;

  // Expired or revoked session: sign out of that side and go to its sign-in page.
  if (response.status === 401 && token) {
    const { router } = await import('@/router');
    if (side === 'staff') setStaff(null);
    else setCustomer(null);
    const login = side === 'staff' ? 'login' : 'customer-login';
    if (router.currentRoute.value.name !== login) {
      void router.push({ name: login, query: { redirect: router.currentRoute.value.fullPath } });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, body?.error ?? `Request failed (${response.status})`, body?.details);
  }
  return body as T;
}

/** Builds "?a=1&b=x" from the defined values (empty string when there are none). */
export function toQuery(params: Record<string, string | number | boolean | null | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const text = query.toString();
  return text ? `?${text}` : '';
}
