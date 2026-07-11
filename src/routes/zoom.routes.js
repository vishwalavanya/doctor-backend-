import { Router } from 'express';
import {
  createZoomMeetingController,
  updateZoomMeetingController,
  deleteZoomMeetingController,
  getZoomMeetingController
} from '../controllers/zoom.controller.js';
import { getMeetingHistoryByMeetingId } from '../services/zoom.service.js';
import { authenticate, requireOwnResource } from '../middlewares/auth.middleware.js';

const router = Router();

// NOTE: `authenticate` is applied per-route (not via router.use) because
// this router is mounted at the app root alongside other routers
// (see app.js). A router-level `router.use(authenticate)` with no path
// would run for every request that reaches this router in the middleware
// chain - including requests meant for other routers - so each route below
// lists `authenticate` explicitly instead.

router.post('/zoom/meetings', authenticate, createZoomMeetingController);

// Ownership for existing meetings is resolved via meetingHistory, which
// records which doctor a given Zoom meetingId belongs to. If no history
// record exists (meeting created before this field existed, or created
// without an appointment), we allow the request through rather than
// locking doctors out of meetings created before this change.
router.get(
  '/zoom/meetings/:meetingId',
  authenticate,
  requireOwnResource(getMeetingHistoryByMeetingId, { paramName: 'meetingId', allowMissing: true }),
  getZoomMeetingController
);
router.put(
  '/zoom/meetings/:meetingId',
  authenticate,
  requireOwnResource(getMeetingHistoryByMeetingId, { paramName: 'meetingId', allowMissing: true }),
  updateZoomMeetingController
);
router.delete(
  '/zoom/meetings/:meetingId',
  authenticate,
  requireOwnResource(getMeetingHistoryByMeetingId, { paramName: 'meetingId', allowMissing: true }),
  deleteZoomMeetingController
);

export default router;