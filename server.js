import dotenv from 'dotenv';
dotenv.config({ override: true });

import app from './src/app.js';
import { startQueueWorkers } from './src/queue/worker.js';
import { logger } from './src/utils/logger.js';

const port = Number.parseInt(process.env.PORT || '3000', 10);

startQueueWorkers();

app.listen(port, () => {
  logger.info('Doctor Scheduler backend started', {
    port,
    env: process.env.NODE_ENV || 'development'
  });
});
