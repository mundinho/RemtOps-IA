import type { ChatTurn, CustomerOption, PublicEquipment, RentalRequestCreated, RentalRequestPayload, RequestStatus } from '@/types';
import { http } from './http';

export const publicApi = {
  equipment: (code: string) => http<PublicEquipment>(`/public/equipment/${code}`),
  createRequest: (code: string, payload: RentalRequestPayload) =>
    http<RentalRequestCreated>(`/public/equipment/${code}/rental-requests`, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  requestStatus: (id: string) => http<RequestStatus>(`/public/rental-requests/${id}`),
  assistant: (code: string, messages: ChatTurn[], rentalId?: string) =>
    http<{ reply: string; toolsUsed: string[] }>(`/public/equipment/${code}/assistant`, {
      method: 'POST',
      body: JSON.stringify({ messages, rentalId }),
    }),
  // Demo only: lets the presenter choose which customer is "scanning"
  customers: () => http<CustomerOption[]>('/public/demo-customers'),
};
