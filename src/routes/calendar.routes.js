// src/routes/calendar.routes.js
import { Router } from 'express';
import {
  generateGoogleAuthUrlController,
  connectGoogleController,
  createCalendarEventController,
  updateCalendarEventController,
  deleteCalendarEventController,
  listCalendarEventsController,
  syncDoctorCalendarController,
  createWatchChannelController,
  stopWatchChannelController,
  getCalendarEventController,
  listGoogleCalendarsController
} from '../controllers/calendar.controller.js';

const router = Router();

router.get('/calendar/google/auth-url', generateGoogleAuthUrlController);
router.post('/calendar/google/connect', connectGoogleController);
router.get('/calendar/google/calendars', listGoogleCalendarsController);
router.get('/calendar/events', listCalendarEventsController);
router.post('/calendar/events', createCalendarEventController);
router.get('/calendar/events/:eventId', getCalendarEventController);
router.put('/calendar/events/:eventId', updateCalendarEventController);
router.delete('/calendar/events/:eventId', deleteCalendarEventController);
router.post('/calendar/watch', createWatchChannelController);
router.post('/calendar/watch/stop', stopWatchChannelController);
router.post('/calendar/sync', syncDoctorCalendarController);

export default router;