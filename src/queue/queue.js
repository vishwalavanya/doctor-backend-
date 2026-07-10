import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';

class QueueManager {
  constructor() {
    this.queues = new Map();
  }

  ensureQueue(queueName) {
    if (!this.queues.has(queueName)) {
      this.queues.set(queueName, {
        items: [],
        processing: false
      });
    }
    return this.queues.get(queueName);
  }

  enqueue(queueName, job) {
    const queue = this.ensureQueue(queueName);
    const record = {
      id: job.id || uuidv4(),
      queueName,
      type: job.type,
      payload: job.payload || {},
      attempt: Number.isFinite(job.attempt) ? job.attempt : 0,
      maxAttempts: Number.isFinite(job.maxAttempts) ? job.maxAttempts : 5,
      metadata: job.metadata || {},
      createdAt: job.createdAt || new Date().toISOString()
    };
    queue.items.push(record);
    logger.info('Queue event', {
      event: 'enqueued',
      queueName,
      jobId: record.id,
      jobType: record.type,
      attempt: record.attempt
    });
    return record;
  }

  dequeue(queueName) {
    const queue = this.ensureQueue(queueName);
    return queue.items.shift() || null;
  }

  hasJobs(queueName) {
    const queue = this.ensureQueue(queueName);
    return queue.items.length > 0;
  }

  isProcessing(queueName) {
    return this.ensureQueue(queueName).processing;
  }

  setProcessing(queueName, processing) {
    this.ensureQueue(queueName).processing = processing;
  }

  size(queueName) {
    return this.ensureQueue(queueName).items.length;
  }
}

export const queueManager = new QueueManager();

