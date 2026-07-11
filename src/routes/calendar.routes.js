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
import { getCalendarEventById } from '../services/calendar.service.js';
import { authenticate, attachDoctorScope, requireOwnResource } from '../middlewares/auth.middleware.js';

const router = Router();

// NOTE: `authenticate` is applied per-route (not via router.use) because
// this router is mounted at the app root alongside other routers
// (see app.js). A router-level `router.use(authenticate)` with no path
// would run for every request that reaches this router in the middleware
// chain - including requests meant for other routers - so each route below
// lists `authenticate` explicitly instead.

router.get('/calendar/google/auth-url', authenticate, generateGoogleAuthUrlController);
router.post('/calendar/google/connect', authenticate, attachDoctorScope, connectGoogleController);
router.get('/calendar/google/calendars', authenticate, listGoogleCalendarsController);

router.get('/calendar/events', authenticate, attachDoctorScope, listCalendarEventsController);
router.post('/calendar/events', authenticate, attachDoctorScope, createCalendarEventController);

router.get(
  '/calendar/events/:eventId',
  authenticate,
  requireOwnResource(getCalendarEventById, { paramName: 'eventId' }),
  getCalendarEventController
);
router.put(
  '/calendar/events/:eventId',
  authenticate,
  requireOwnResource(getCalendarEventById, { paramName: 'eventId' }),
  updateCalendarEventController
);
router.delete(
  '/calendar/events/:eventId',
  authenticate,
  requireOwnResource(getCalendarEventById, { paramName: 'eventId' }),
  deleteCalendarEventController
);

router.post('/calendar/watch', authenticate, attachDoctorScope, createWatchChannelController);
router.post('/calendar/watch/stop', authenticate, stopWatchChannelController);
router.post('/calendar/sync', authenticate, attachDoctorScope, syncDoctorCalendarController);

export default router;