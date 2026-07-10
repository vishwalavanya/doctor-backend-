import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { bookAppointment, cancelAppointment, rescheduleAppointment, getAppointmentById, listAppointments, deleteAppointment } from '../services/appointment.service.js';

export const bookAppointmentController = asyncHandler(async (req, res) => {
  const appointment = await bookAppointment(req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, appointment, 'Appointment booked', 201, { requestId: req.requestId });
});

export const cancelAppointmentController = asyncHandler(async (req, res) => {
  const appointment = await cancelAppointment(req.params.appointmentId, req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, appointment, 'Appointment cancelled', 200, { requestId: req.requestId });
});

export const rescheduleAppointmentController = asyncHandler(async (req, res) => {
  const appointment = await rescheduleAppointment(req.params.appointmentId, req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, appointment, 'Appointment rescheduled', 200, { requestId: req.requestId });
});

export const getAppointmentController = asyncHandler(async (req, res) => {
  const appointment = await getAppointmentById(req.params.appointmentId);
  if (!appointment) {
    return sendSuccess(res, null, 'Appointment not found', 404, { requestId: req.requestId });
  }
  return sendSuccess(res, appointment, 'Appointment fetched', 200, { requestId: req.requestId });
});

export const listAppointmentsController = asyncHandler(async (req, res) => {
  const appointments = await listAppointments({
    doctorId: req.query.doctorId,
    patientId: req.query.patientId,
    status: req.query.status,
    from: req.query.from,
    to: req.query.to,
    search: req.query.search
  });
  return sendSuccess(res, appointments, 'Appointments fetched', 200, { requestId: req.requestId });
});

export const deleteAppointmentController = asyncHandler(async (req, res) => {
  const result = await deleteAppointment(req.params.appointmentId, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, result, 'Appointment deleted', 200, { requestId: req.requestId });
});

