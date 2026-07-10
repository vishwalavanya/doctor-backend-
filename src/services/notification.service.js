import { COLLECTIONS } from '../utils/constants.js';
import { addDocument, getDocument, queryDocuments, updateDocument } from './firestore.service.js';
import { nowIso, uuid } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { recordSchedulingLog } from './log.service.js';

export async function createNotification({
  userId = null,
  doctorId = null,
  appointmentId = null,
  type = 'system',
  title,
  message,
  metadata = {},
  status = 'queued'
}) {
  const payload = {
    id: uuid(),
    userId,
    doctorId,
    appointmentId,
    type,
    title,
    message,
    metadata,
    status,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: Date.now(),
    updatedAtMs: Date.now()
  };

  const notification = await addDocument(COLLECTIONS.NOTIFICATIONS, payload);
  await recordSchedulingLog({
    level: 'info',
    type: 'notification.created',
    message: title,
    entityType: 'notification',
    entityId: notification?.id || payload.id,
    doctorId,
    appointmentId,
    metadata
  });

  logger.info('Notification created', {
    notificationId: notification?.id || payload.id,
    doctorId,
    appointmentId,
    type
  });

  return notification;
}

export async function markNotificationDelivered(notificationId, metadata = {}) {
  const notification = await updateDocument(COLLECTIONS.NOTIFICATIONS, notificationId, {
    status: 'delivered',
    deliveredAt: nowIso(),
    updatedAt: nowIso(),
    updatedAtMs: Date.now(),
    ...metadata
  });

  logger.info('Notification marked delivered', { notificationId });
  return notification;
}

export async function listNotifications(filters = {}) {
  const records = await queryDocuments(COLLECTIONS.NOTIFICATIONS, []);

  return records.filter((record) => {
    if (filters.userId && record.userId !== filters.userId) return false;
    if (filters.doctorId && record.doctorId !== filters.doctorId) return false;
    if (filters.appointmentId && record.appointmentId !== filters.appointmentId) return false;
    if (filters.status && record.status !== filters.status) return false;
    return true;
  }).sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0));
}

export async function getNotification(notificationId) {
  return getDocument(COLLECTIONS.NOTIFICATIONS, notificationId);
}
