import type { Equipment, EquipmentDetail } from '@/types';
import { http } from './http';

export const equipmentApi = {
  list: () => http<Equipment[]>('/equipment'),
  get: (code: string) => http<EquipmentDetail>(`/equipment/${code}`),
  qrUrl: (code: string) => `/api/equipment/${code}/qr`,
};
