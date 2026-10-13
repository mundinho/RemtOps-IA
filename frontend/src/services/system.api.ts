import { http } from './http';

export interface Health {
  status: string;
  llm: { provider: string; model: string };
}

export const systemApi = {
  health: () => http<Health>('/health'),
  resetDemo: () => http<{ status: string }>('/demo/reset', { method: 'POST' }),
};
