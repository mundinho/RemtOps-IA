import cors from 'cors';
import express from 'express';
import { router } from './routes/index.js';
import { errorHandler } from './utils/errors.js';

export function createApp() {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/api', router);
  app.use((_req, res) => {
    res.status(404).json({ error: 'Route not found' });
  });
  app.use(errorHandler);
  return app;
}
