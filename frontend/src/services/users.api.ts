import type { StaffRole, StaffUser } from '@/types';
import { http } from './http';

export const usersApi = {
  list: () => http<StaffUser[]>('/users'),
  create: (payload: { name: string; email: string; role: StaffRole; password: string }) =>
    http<StaffUser>('/users', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: { role?: StaffRole; isActive?: boolean; password?: string }) =>
    http<StaffUser>(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(payload) }),
};
