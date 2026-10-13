import type { Customer, CustomerPayload } from '@/types';
import { http } from './http';

export const customersApi = {
  list: () => http<Customer[]>('/customers'),
  create: (payload: CustomerPayload) => http<Customer>('/customers', { method: 'POST', body: JSON.stringify(payload) }),
  update: (id: string, payload: CustomerPayload) =>
    http<Customer>(`/customers/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
};
