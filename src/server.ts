import express from 'express';
import { healthRouter } from './routes/health';
import { webhooksRouter } from './routes/webhooks';
import { adminRouter } from './routes/admin';

export function createServer() {
  const app = express();

  // Webhook route must be defined BEFORE JSON middleware to preserve raw body
  app.use(webhooksRouter);

  // JSON middleware for all other routes
  app.use(express.json());

  app.use(healthRouter);
  app.use(adminRouter);

  return app;
}
