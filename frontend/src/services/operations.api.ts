import type { FinanceSummary, MaintenanceOrder, MonitoringStatus, MpesaRefund, Payment, PaymentStatus, Report, ReportType } from '@/types';
import { http, toQuery } from './http';

export const operationsApi = {
  payments: (status?: PaymentStatus) => http<Payment[]>(`/payments${toQuery({ status })}`),
  financeSummary: () => http<FinanceSummary>('/finance/summary'),
  maintenanceOrders: () => http<MaintenanceOrder[]>('/maintenance-orders'),
  runMonitoring: () => http<{ status: string }>('/monitoring/run', { method: 'POST' }),
  monitoringStatus: () => http<MonitoringStatus>('/monitoring/status'),
  refunds: () => http<MpesaRefund[]>('/refunds'),
  markRefunded: (id: string, note?: string) =>
    http<{ id: string; refunded: true }>(`/refunds/${id}/mark-refunded`, { method: 'POST', body: JSON.stringify({ note }) }),
  report: (type: ReportType, from: string, to: string) => http<Report>(`/reports/${type}${toQuery({ from, to })}`),
};
