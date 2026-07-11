import { Router } from 'express';
import {
  createDoctorController,
  updateDoctorController,
  deleteDoctorController,
  getDoctorController,
  listDoctorsController,
  getDoctorAvailabilityController,
  addLeaveDayController,
  removeLeaveDayController
} from '../controllers/doctor.controller.js';
import { authenticate, requireOwnDoctorParam } from '../middlewares/auth.middleware.js';

const router = Router();

// Public: doctor directory + availability stay open so patients can browse
// doctors and check open slots without an account. This preserves the
// existing public booking flow and does not break current behavior.
router.post('/doctors', createDoctorController);
router.get('/doctors', listDoctorsController);
router.get('/doctors/:doctorId', getDoctorController);
router.get('/doctors/:doctorId/availability', getDoctorAvailabilityController);

// Protected: a doctor may only edit/delete their own profile and manage
// their own leave days. Prefer /auth/profile for self-service profile
// edits going forward - these routes remain for backward compatibility.
router.put('/doctors/:doctorId', authenticate, requireOwnDoctorParam('doctorId'), updateDoctorController);
router.delete('/doctors/:doctorId', authenticate, requireOwnDoctorParam('doctorId'), deleteDoctorController);
router.post('/doctors/:doctorId/leave-days', authenticate, requireOwnDoctorParam('doctorId'), addLeaveDayController);
router.delete('/doctors/:doctorId/leave-days', authenticate, requireOwnDoctorParam('doctorId'), removeLeaveDayController);

export default router;