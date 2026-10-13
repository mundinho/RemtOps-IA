import type { FinanceSummary, MaintenanceOrder, MonitoringStatus, Payment, PaymentStatus } from '@/types';
import { http, toQuery } from './http';

export const operationsApi = {
  payments: (status?: PaymentStatus) => http<Payment[]>(`/payments${toQuery({ status })}`),
  financeSummary: () => http<FinanceSummary>('/finance/summary'),
  maintenanceOrders: () => http<MaintenanceOrder[]>('/maintenance-orders'),
  runMonitoring: () => http<{ status: string }>('/monitoring/run', { method: 'POST' }),
  monitoringStatus: () => http<MonitoringStatus>('/monitoring/status'),
};
