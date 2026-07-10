import { enqueueJob } from '../queue/queue.service.js';
import { logger } from '../utils/logger.js';
import { RETRY_DELAYS_MS } from '../utils/constants.js';

export async function processRetryJob(job) {
  const { originalQueue, originalJob, error, nextAttempt } = job.payload || {};
  const delayMs = RETRY_DELAYS_MS[Math.min(Math.max((nextAttempt || 1) - 1, 0), RETRY_DELAYS_MS.length - 1)] || RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];

  logger.warn('Retry job scheduled', {
    queueName: originalQueue,
    originalJobId: originalJob?.id,
    nextAttempt,
    delayMs,
    error
  });

  setTimeout(() => {
    enqueueJob(originalQueue, originalJob.type, originalJob.payload, {
      attempt: nextAttempt,
      maxAttempts: originalJob.maxAttempts,
      metadata: originalJob.metadata
    });
    logger.info('Retry job re-enqueued', {
      queueName: originalQueue,
      originalJobId: originalJob?.id,
      nextAttempt
    });
  }, delayMs);
}

