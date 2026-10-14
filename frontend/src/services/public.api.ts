import type { ChatTurn, CustomerOption, MpesaCheckout, PublicEquipment, RentalRequestCreated, RentalRequestPayload, RequestStatus } from '@/types';
import { http } from './http';

export const publicApi = {
  equipment: (code: string) => http<PublicEquipment>(`/public/equipment/${code}`),
  createRequest: (code: string, payload: RentalRequestPayload & { mpesaCheckoutId?: string }) =>
    http<RentalRequestCreated>(`/public/equipment/${code}/rental-requests`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestStatus: (id: string) => http<RequestStatus>(`/public/rental-requests/${id}`),
  /** Pays the M-Pesa deposit; the request is created once the customer confirms with their PIN. */
  mpesaCheckout: (code: string, payload: RentalRequestPayload & { mpesaPhone: string }) =>
    http<{ checkoutId: string; status: 'PENDING'; amount: number; total: number }>(`/public/equipment/${code}/mpesa-checkout`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  checkout: (id: string) => http<MpesaCheckout>(`/public/mpesa-checkouts/${id}`),
  assistant: (code: string, messages: ChatTurn[], rentalId?: string) =>
    http<{ reply: string; toolsUsed: string[] }>(`/public/equipment/${code}/assistant`, {
      method: 'POST',
      body: JSON.stringify({ messages, rentalId }),
    }),
  // Demo only: lets the presenter choose which customer is "scanning"
  customers: () => http<CustomerOption[]>('/public/demo-customers'),
};
