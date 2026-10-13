import type { Overview, Statistics } from '@/types';
import { http } from './http';

export const dashboardApi = {
  overview: () => http<Overview>('/dashboard/overview'),
  statistics: () => http<Statistics>('/dashboard/statistics'),
};
