import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { createDoctor, updateDoctor, deleteDoctor, getDoctorById, listDoctors, getDoctorAvailability, addLeaveDay, removeLeaveDay } from '../services/doctor.service.js';

export const createDoctorController = asyncHandler(async (req, res) => {
  const doctor = await createDoctor(req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, doctor, 'Doctor created', 201, { requestId: req.requestId });
});

export const updateDoctorController = asyncHandler(async (req, res) => {
  const doctor = await updateDoctor(req.params.doctorId, req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, doctor, 'Doctor updated', 200, { requestId: req.requestId });
});

export const deleteDoctorController = asyncHandler(async (req, res) => {
  const result = await deleteDoctor(req.params.doctorId, { requestId: req.requestId, userId: req.userId }, { hardDelete: req.query.hard === 'true' });
  return sendSuccess(res, result, 'Doctor deleted', 200, { requestId: req.requestId });
});

export const getDoctorController = asyncHandler(async (req, res) => {
  const doctor = await getDoctorById(req.params.doctorId);
  if (!doctor) {
    return sendSuccess(res, null, 'Doctor not found', 404, { requestId: req.requestId });
  }
  return sendSuccess(res, doctor, 'Doctor fetched', 200, { requestId: req.requestId });
});

export const listDoctorsController = asyncHandler(async (req, res) => {
  const doctors = await listDoctors({
    status: req.query.status,
    specialization: req.query.specialization,
    search: req.query.search
  });
  return sendSuccess(res, doctors, 'Doctors fetched', 200, { requestId: req.requestId });
});

export const getDoctorAvailabilityController = asyncHandler(async (req, res) => {
  const availability = await getDoctorAvailability(req.params.doctorId, req.query.date, {
    slotMinutes: req.query.slotMinutes
  });
  return sendSuccess(res, availability, 'Doctor availability fetched', 200, { requestId: req.requestId });
});

export const addLeaveDayController = asyncHandler(async (req, res) => {
  const doctor = await addLeaveDay(req.params.doctorId, req.body.date, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, doctor, 'Leave day added', 200, { requestId: req.requestId });
});

export const removeLeaveDayController = asyncHandler(async (req, res) => {
  const doctor = await removeLeaveDay(req.params.doctorId, req.body.date, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, doctor, 'Leave day removed', 200, { requestId: req.requestId });
});

