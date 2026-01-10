import { Router, Request, Response } from 'express';
import { metricsCollector } from '../metrics';

export const healthRouter = Router();

healthRouter.get('/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

/**
 * GET /metrics - Return metrics in Prometheus format
 */
healthRouter.get('/metrics', (_req: Request, res: Response) => {
  res.set('Content-Type', 'text/plain');
  res.send(metricsCollector.getPrometheusMetrics());
});

/**
 * GET /api/metrics - Return metrics as JSON
 */
healthRouter.get('/api/metrics', (_req: Request, res: Response) => {
  res.json(metricsCollector.getMetrics());
});
