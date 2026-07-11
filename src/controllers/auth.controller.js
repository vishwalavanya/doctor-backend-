// src/controllers/auth.controller.js
import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import {
  registerDoctor,
  loginDoctor,
  getCurrentDoctorProfile,
  updateDoctorProfile,
  changeDoctorPassword
} from '../services/auth.service.js';

export const registerController = asyncHandler(async (req, res) => {
  const result = await registerDoctor(req.body, { requestId: req.requestId });
  return sendSuccess(res, result, 'Doctor account created', 201, { requestId: req.requestId });
});

export const loginController = asyncHandler(async (req, res) => {
  const result = await loginDoctor(req.body, { requestId: req.requestId });
  return sendSuccess(res, result, 'Login successful', 200, { requestId: req.requestId });
});

export const meController = asyncHandler(async (req, res) => {
  const doctor = await getCurrentDoctorProfile(req.userId);
  return sendSuccess(res, doctor, 'Profile fetched', 200, { requestId: req.requestId });
});

export const updateProfileController = asyncHandler(async (req, res) => {
  const doctor = await updateDoctorProfile(req.userId, req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, doctor, 'Profile updated', 200, { requestId: req.requestId });
});

export const changePasswordController = asyncHandler(async (req, res) => {
  const result = await changeDoctorPassword(req.userId, req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, result, 'Password changed successfully', 200, { requestId: req.requestId });
});

export const logoutController = asyncHandler(async (req, res) => {
  // JWTs are stateless - logout is handled client-side by discarding the
  // token. This endpoint exists so clients have a consistent API to call.
  return sendSuccess(res, { loggedOut: true }, 'Logged out successfully', 200, { requestId: req.requestId });
});