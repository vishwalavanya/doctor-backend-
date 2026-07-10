import { queueManager } from './queue.js';
import { JOB_TYPES, QUEUE_NAMES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

const debounceTimers = new Map();

export function enqueueJob(queueName, type, payload = {}, options = {}) {
  const job = queueManager.enqueue(queueName, {
    type,
    payload,
    attempt: options.attempt || 0,
    maxAttempts: options.maxAttempts || 5,
    metadata: options.metadata || {}
  });

  logger.info('Job enqueued', {
    queueName,
    type,
    jobId: job.id
  });

  return job;
}

export function scheduleDebouncedJob(queueName, debouncedKey, type, payload = {}, delayMs = 1000, options = {}) {
  const key = `${queueName}:${debouncedKey}:${type}`;
  if (debounceTimers.has(key)) {
    clearTimeout(debounceTimers.get(key));
  }

  const timer = setTimeout(() => {
    debounceTimers.delete(key);
    enqueueJob(queueName, type, payload, options);
    logger.info('Debounced job flushed', {
      queueName,
      debouncedKey,
      type,
      delayMs
    });
  }, delayMs);

  debounceTimers.set(key, timer);
  logger.info('Debounced job scheduled', {
    queueName,
    debouncedKey,
    type,
    delayMs
  });
}

export function enqueueRetryProcess(originalQueue, originalJob, error, nextAttempt) {
  return enqueueJob(QUEUE_NAMES.RETRY, JOB_TYPES.RETRY_PROCESS, {
    originalQueue,
    originalJob,
    error,
    nextAttempt
  });
}

export function clearAllDebounces() {
  for (const timer of debounceTimers.values()) {
    clearTimeout(timer);
  }
  debounceTimers.clear();
}

