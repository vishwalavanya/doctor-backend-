import { Router } from 'express';
import {
  bookAppointmentController,
  cancelAppointmentController,
  rescheduleAppointmentController,
  getAppointmentController,
  listAppointmentsController,
  deleteAppointmentController
} from '../controllers/appointment.controller.js';
import { getAppointmentById } from '../services/appointment.service.js';
import { authenticate, attachDoctorScope, requireOwnResource } from '../middlewares/auth.middleware.js';

const router = Router();

// NOTE: `authenticate` is applied per-route (not via router.use) because
// this router is mounted at the app root alongside other routers
// (see app.js). A router-level `router.use(authenticate)` with no path
// would run for every request that reaches this router in the middleware
// chain - including requests meant for other routers like /auth/register -
// so each route below lists `authenticate` explicitly instead.

router.post('/appointments', authenticate, attachDoctorScope, bookAppointmentController);
router.get('/appointments', authenticate, attachDoctorScope, listAppointmentsController);

router.get(
  '/appointments/:appointmentId',
  authenticate,
  requireOwnResource(getAppointmentById, { paramName: 'appointmentId' }),
  getAppointmentController
);
router.put(
  '/appointments/:appointmentId/reschedule',
  authenticate,
  requireOwnResource(getAppointmentById, { paramName: 'appointmentId' }),
  rescheduleAppointmentController
);
router.patch(
  '/appointments/:appointmentId/cancel',
  authenticate,
  requireOwnResource(getAppointmentById, { paramName: 'appointmentId' }),
  cancelAppointmentController
);
router.delete(
  '/appointments/:appointmentId',
  authenticate,
  requireOwnResource(getAppointmentById, { paramName: 'appointmentId' }),
  deleteAppointmentController
);

export default router;