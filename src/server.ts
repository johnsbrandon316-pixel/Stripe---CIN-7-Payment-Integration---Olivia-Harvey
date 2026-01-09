import express from 'express';
import { healthRouter } from './routes/health';

export function createServer() {
  const app = express();
  app.use(express.json());

  app.use(healthRouter);

  return app;
}
