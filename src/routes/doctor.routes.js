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

const router = Router();

router.post('/doctors', createDoctorController);
router.get('/doctors', listDoctorsController);
router.get('/doctors/:doctorId', getDoctorController);
router.put('/doctors/:doctorId', updateDoctorController);
router.delete('/doctors/:doctorId', deleteDoctorController);
router.get('/doctors/:doctorId/availability', getDoctorAvailabilityController);
router.post('/doctors/:doctorId/leave-days', addLeaveDayController);
router.delete('/doctors/:doctorId/leave-days', removeLeaveDayController);

export default router;

