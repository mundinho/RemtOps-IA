import type { ErrorRequestHandler } from 'express';
import { ZodError, z } from 'zod';

export class AppError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (what: string) => new AppError(404, `${what} not found`);

/** Express 5 forwards rejected promises here, so controllers can simply throw. */
export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof ZodError) {
    res.status(400).json({ error: 'Validation failed', details: z.flattenError(error).fieldErrors });
    return;
  }
  if (error instanceof AppError) {
    res.status(error.status).json({ error: error.message, details: error.details });
    return;
  }
  console.error(error);
  res.status(500).json({ error: 'Internal server error' });
};
