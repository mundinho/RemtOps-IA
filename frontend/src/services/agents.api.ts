import type { AgentExecution, AgentExecutionDetail, AgentName, Alert, HumanReview, Notification, ReviewStatus } from '@/types';
import { http, toQuery } from './http';

export const agentsApi = {
  executions: (filter: { agent?: AgentName; correlationId?: string; limit?: number } = {}) =>
    http<AgentExecution[]>(`/agent-executions${toQuery(filter)}`),
  execution: (id: string) => http<AgentExecutionDetail>(`/agent-executions/${id}`),
  /** Flagged cases and the decisions the AI took on them (read-only). */
  cases: (status?: ReviewStatus) => http<HumanReview[]>(`/cases${toQuery({ status })}`),
  alerts: () => http<Alert[]>('/alerts'),
  notifications: () => http<Notification[]>('/notifications'),
};
