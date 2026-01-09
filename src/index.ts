import { createServer } from './server';
import logger from './logger';
import { config } from './config';

const app = createServer();

app.listen(config.APP_PORT, () => {
  logger.info(`Service running on port ${config.APP_PORT}`);
});
