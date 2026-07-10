import { Router } from 'express';
import {
  createZoomMeetingController,
  updateZoomMeetingController,
  deleteZoomMeetingController,
  getZoomMeetingController
} from '../controllers/zoom.controller.js';

const router = Router();

router.post('/zoom/meetings', createZoomMeetingController);
router.get('/zoom/meetings/:meetingId', getZoomMeetingController);
router.put('/zoom/meetings/:meetingId', updateZoomMeetingController);
router.delete('/zoom/meetings/:meetingId', deleteZoomMeetingController);

export default router;

