import { Router } from 'express';
import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { handleGoogleWebhook } from '../services/calendar.service.js';
import { queueManager } from '../queue/queue.js';
import { QUEUE_NAMES, JOB_TYPES } from '../utils/constants.js';
import { recordSchedulingLog } from '../services/log.service.js';
import { nowIso, nowMs, uuid } from '../utils/helpers.js';
import { addDocument } from '../services/firestore.service.js';
import { COLLECTIONS } from '../utils/constants.js';

const router = Router();

router.post('/webhooks/google/calendar', asyncHandler(async (req, res) => {
  const event = await handleGoogleWebhook(req.headers, req.body);
  return sendSuccess(res, event, 'Google webhook received', 200, { requestId: req.requestId });
}));

router.post('/webhooks/zoom', asyncHandler(async (req, res) => {
  const event = await addDocument(COLLECTIONS.WEBHOOK_EVENTS, {
    id: uuid(),
    source: 'zoom',
    body: req.body,
    headers: req.headers,
    receivedAt: nowIso(),
    receivedAtMs: nowMs()
  });

  await recordSchedulingLog({
    type: 'webhook.zoom.received',
    message: 'Zoom webhook received',
    entityType: 'webhookEvent',
    entityId: event.id,
    requestId: req.requestId,
    metadata: {
      eventType: req.body?.event || req.body?.event_type || null
    }
  });

  queueManager.enqueue(QUEUE_NAMES.NOTIFICATIONS, {
    type: JOB_TYPES.NOTIFICATION_SEND,
    payload: {
      type: 'webhook.zoom',
      title: 'Zoom webhook received',
      message: 'A Zoom webhook notification was received.',
      metadata: {
        eventType: req.body?.event || req.body?.event_type || null
      }
    }
  });

  return sendSuccess(res, event, 'Zoom webhook received', 200, { requestId: req.requestId });
}));

export default router;

