import type { Request, Response } from 'express';
import { AlertListQuery, AuditListQuery, ExecutionListQuery, IdParam, ReviewListQuery } from '../models/schemas.js';
import { getExecution, listExecutions } from '../services/agentExecution.service.js';
import { listAlerts } from '../services/alert.service.js';
import { listAuditLogs } from '../services/audit.service.js';
import { listNotifications } from '../services/notification.service.js';
import { listReviews } from '../services/review.service.js';

/** Read-only views over what the agents did: executions, cases, alerts, notifications, audit. */

export async function executions(req: Request, res: Response) {
  res.json(await listExecutions(ExecutionListQuery.parse(req.query)));
}

export async function execution(req: Request, res: Response) {
  const { id } = IdParam.parse(req.params);
  res.json(await getExecution(id));
}

export async function reviews(req: Request, res: Response) {
  res.json(await listReviews(ReviewListQuery.parse(req.query)));
}

export async function alerts(req: Request, res: Response) {
  res.json(await listAlerts(AlertListQuery.parse(req.query)));
}

export async function notifications(_req: Request, res: Response) {
  res.json(await listNotifications());
}

export async function auditLogs(req: Request, res: Response) {
  res.json(await listAuditLogs(AuditListQuery.parse(req.query)));
}
