import { COLLECTIONS } from '../utils/constants.js';
import { nowIso, uuid } from '../utils/helpers.js';
import { addDocument } from './firestore.service.js';
import { logger } from '../utils/logger.js';

export async function recordSchedulingLog({
  level = 'info',
  type,
  message,
  entityType = null,
  entityId = null,
  doctorId = null,
  appointmentId = null,
  requestId = null,
  metadata = {}
}) {
  const payload = {
    id: uuid(),
    level,
    type,
    message,
    entityType,
    entityId,
    doctorId,
    appointmentId,
    requestId,
    metadata,
    createdAt: nowIso(),
    createdAtMs: Date.now()
  };

  try {
    const log = await addDocument(COLLECTIONS.SCHEDULING_LOGS, payload);
    logger.info('Scheduling log recorded', { type, entityType, entityId, doctorId, appointmentId, requestId });
    return log;
  } catch (error) {
    logger.error('Failed to persist scheduling log', { error, payload });
    return payload;
  }
}

export async function recordQueueEvent({
  queueName,
  event,
  jobId = null,
  jobType = null,
  requestId = null,
  metadata = {}
}) {
  return recordSchedulingLog({
    level: event === 'failed' ? 'error' : 'info',
    type: `queue.${event}`,
    message: `Queue ${event}`,
    entityType: 'queue',
    entityId: jobId,
    requestId,
    metadata: {
      queueName,
      jobType,
      ...metadata
    }
  });
}

