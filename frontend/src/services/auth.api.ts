import type { CustomerPortal, CustomerRegistrationPayload, RegistrationStatus, StaffUser } from '@/types';
import { http } from './http';

interface Credentials {
  email: string;
  password: string;
}

const post = (body: unknown) => ({ method: 'POST', body: JSON.stringify(body) });

export const authApi = {
  staffLogin: (credentials: Credentials) =>
    http<{ token: string; expiresAt: string; user: StaffUser }>('/auth/staff/login', post(credentials)),
  staffMe: () => http<StaffUser>('/auth/staff/me'),

  customerLogin: (credentials: Credentials) =>
    http<{ token: string; expiresAt: string; customer: { id: string; code: string; companyName: string } }>('/auth/customer/login', post(credentials)),
  register: (payload: CustomerRegistrationPayload) =>
    http<{ registrationId: string; status: 'PENDING' }>('/auth/customer/register', post(payload)),
  registrationStatus: (id: string) => http<RegistrationStatus>(`/auth/customer/registrations/${id}`),

  portal: () => http<CustomerPortal>('/portal'),
};
