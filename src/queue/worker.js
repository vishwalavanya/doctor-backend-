import { queueManager } from './queue.js';
import { QUEUE_NAMES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { processCalendarJob } from '../jobs/calendar.job.js';
import { processZoomJob } from '../jobs/zoom.job.js';
import { processRetryJob } from '../jobs/retry.job.js';
import { processNotificationJob } from '../jobs/notification.job.js';
import { recordQueueEvent } from '../services/log.service.js';

const queueHandlers = {
  [QUEUE_NAMES.GOOGLE_SYNC]: processCalendarJob,
  [QUEUE_NAMES.ZOOM_SYNC]: processZoomJob,
  [QUEUE_NAMES.NOTIFICATIONS]: processNotificationJob,
  [QUEUE_NAMES.RETRY]: processRetryJob
};

let started = false;
let timers = [];

async function drainQueue(queueName) {
  const handler = queueHandlers[queueName];
  if (!handler || queueManager.isProcessing(queueName)) {
    return;
  }

  queueManager.setProcessing(queueName, true);
  try {
    while (queueManager.hasJobs(queueName)) {
      const job = queueManager.dequeue(queueName);
      if (!job) {
        continue;
      }

      await recordQueueEvent({
        queueName,
        event: 'started',
        jobId: job.id,
        jobType: job.type,
        metadata: {
          attempt: job.attempt
        }
      });

      try {
        await handler(job);
        await recordQueueEvent({
          queueName,
          event: 'completed',
          jobId: job.id,
          jobType: job.type,
          metadata: {
            attempt: job.attempt
          }
        });
      } catch (error) {
        logger.error('Queue job failed', {
          queueName,
          jobId: job.id,
          jobType: job.type,
          attempt: job.attempt,
          error
        });

        if (job.attempt + 1 < job.maxAttempts) {
          queueManager.enqueue(QUEUE_NAMES.RETRY, {
            type: 'retry.process',
            payload: {
              originalQueue: queueName,
              originalJob: job,
              nextAttempt: job.attempt + 1,
              error: {
                message: error.message,
                code: error.code,
                statusCode: error.statusCode
              }
            },
            attempt: job.attempt
          });
        } else {
          await recordQueueEvent({
            queueName,
            event: 'failed',
            jobId: job.id,
            jobType: job.type,
            metadata: {
              attempt: job.attempt,
              error: error.message
            }
          });
        }
      }
    }
  } finally {
    queueManager.setProcessing(queueName, false);
  }
}

export function startQueueWorkers() {
  if (started) {
    return;
  }

  started = true;
  const queueNames = Object.values(QUEUE_NAMES);

  for (const queueName of queueNames) {
    const timer = setInterval(() => {
      drainQueue(queueName).catch((error) => {
        logger.error('Queue worker crashed', { queueName, error });
      });
    }, 500);
    timers.push(timer);
  }

  logger.info('Queue workers started', {
    queues: queueNames
  });
}

export function stopQueueWorkers() {
  for (const timer of timers) {
    clearInterval(timer);
  }
  timers = [];
  started = false;
}
