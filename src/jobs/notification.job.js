import { createNotification } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';

export async function processNotificationJob(job) {
  const payload = job.payload || {};
  await createNotification({
    userId: payload.userId || null,
    doctorId: payload.doctorId || null,
    appointmentId: payload.appointmentId || null,
    type: payload.type || 'system',
    title: payload.title || 'Scheduling update',
    message: payload.message || 'A scheduling event occurred.',
    metadata: payload.metadata || {}
  });

  logger.info('Notification job processed', {
    jobId: job.id,
    appointmentId: payload.appointmentId || null
  });
}

