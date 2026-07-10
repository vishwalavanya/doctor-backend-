import { Router } from 'express';
import {
  bookAppointmentController,
  cancelAppointmentController,
  rescheduleAppointmentController,
  getAppointmentController,
  listAppointmentsController,
  deleteAppointmentController
} from '../controllers/appointment.controller.js';

const router = Router();

router.post('/appointments', bookAppointmentController);
router.get('/appointments', listAppointmentsController);
router.get('/appointments/:appointmentId', getAppointmentController);
router.put('/appointments/:appointmentId/reschedule', rescheduleAppointmentController);
router.patch('/appointments/:appointmentId/cancel', cancelAppointmentController);
router.delete('/appointments/:appointmentId', deleteAppointmentController);

export default router;

