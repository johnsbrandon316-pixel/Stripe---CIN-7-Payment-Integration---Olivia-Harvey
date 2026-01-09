import { createServer } from './server';
import logger from './logger';
import { config } from './config';
import { runMigrations, closeDb } from './db';
import { saleDiscoveryWorker } from './workers/saleDiscoveryWorker';

// Run database migrations on startup
try {
  runMigrations();
} catch (error) {
  logger.error({ msg: 'Failed to run migrations', error });
  process.exit(1);
}

const app = createServer();

app.listen(config.APP_PORT, () => {
  logger.info(`Service running on port ${config.APP_PORT}`);
  
  // Start the sale discovery worker
  saleDiscoveryWorker.start();
});

// Graceful shutdown
process.on('SIGINT', () => {
  logger.info({ msg: 'SIGINT received, shutting down gracefully' });
  saleDiscoveryWorker.stop();
  closeDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info({ msg: 'SIGTERM received, shutting down gracefully' });
  saleDiscoveryWorker.stop();
  closeDb();
  process.exit(0);
});
