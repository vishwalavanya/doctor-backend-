// src/services/auth.service.js
import bcrypt from 'bcrypt';
import { COLLECTIONS, DEFAULT_WORKING_HOURS, DEFAULT_SLOT_MINUTES } from '../utils/constants.js';
import {
  getDocument,
  queryDocuments,
  setDocument,
  updateDocument
} from './firestore.service.js';
import {
  createError,
  ensureFields,
  isNonEmptyString,
  nowIso,
  nowMs,
  uuid,
  withDefaultWorkingHours
} from '../utils/helpers.js';
import { generateToken } from '../utils/jwt.js';
import { logger } from '../utils/logger.js';
import { cacheDoctorRecord, getDoctorRecordCache, invalidateByPrefix } from './cache.service.js';
import { recordSchedulingLog } from './log.service.js';
import { updateDoctor as updateDoctorRecord } from './doctor.service.js';

const SALT_ROUNDS = 10;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/**
 * Removes sensitive fields (passwordHash) before returning a doctor record
 * to the client. Always use this before sending a doctor object in a response.
 */
export function sanitizeDoctor(doctor) {
  if (!doctor) return null;
  const { passwordHash, ...safe } = doctor;
  return safe;
}

async function findDoctorByEmail(email) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) return null;
  const matches = await queryDocuments(COLLECTIONS.DOCTORS, [['email', '==', normalizedEmail]]);
  return matches.find((doctor) => !doctor.isDeleted) || matches[0] || null;
}

export async function registerDoctor(payload, requestContext = {}) {
  ensureFields(payload, ['name', 'email', 'password', 'phone', 'specialization'], 'doctor registration');

  const email = normalizeEmail(payload.email);
  if (!EMAIL_REGEX.test(email)) {
    throw createError(400, 'A valid email address is required', 'VALIDATION_ERROR');
  }

  if (!isNonEmptyString(payload.password) || payload.password.length < 6) {
    throw createError(400, 'Password must be at least 6 characters long', 'VALIDATION_ERROR');
  }

  const existing = await findDoctorByEmail(email);
  if (existing) {
    throw createError(409, 'An account with this email already exists', 'EMAIL_ALREADY_EXISTS');
  }

  const passwordHash = await bcrypt.hash(payload.password, SALT_ROUNDS);
  const id = uuid();

  const record = {
    id,
    name: payload.name,
    email,
    phone: payload.phone,
    specialization: payload.specialization,
    passwordHash,
    timezone: payload.timezone || 'UTC',
    workingHours: withDefaultWorkingHours(payload.workingHours || DEFAULT_WORKING_HOURS),
    leaveDays: [],
    appointmentDurationMinutes: DEFAULT_SLOT_MINUTES,
    status: 'active',
    isDeleted: false,
    googleCalendarId: 'primary',
    googleOwnerId: null,
    zoomEnabled: true,
    notes: '',
    lastLogin: null,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs()
  };

  const doctor = await setDocument(COLLECTIONS.DOCTORS, id, record, false);
  cacheDoctorRecord(id, doctor);

  const token = generateToken({ id: doctor.id, email: doctor.email, role: 'doctor' });

  await recordSchedulingLog({
    type: 'auth.doctor.registered',
    message: 'Doctor account registered',
    entityType: 'doctor',
    entityId: doctor.id,
    doctorId: doctor.id,
    requestId: requestContext.requestId,
    metadata: { email: doctor.email }
  });

  return { doctor: sanitizeDoctor(doctor), token };
}

export async function loginDoctor(payload, requestContext = {}) {
  ensureFields(payload, ['email', 'password'], 'login');

  const doctor = await findDoctorByEmail(payload.email);
  if (!doctor || doctor.isDeleted) {
    throw createError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  if (!doctor.passwordHash) {
    // Account predates the auth system (created via /doctors admin route)
    // and has never set a password.
    throw createError(401, 'This account has no password set. Please contact support.', 'PASSWORD_NOT_SET');
  }

  const passwordMatches = await bcrypt.compare(payload.password, doctor.passwordHash);
  if (!passwordMatches) {
    throw createError(401, 'Invalid email or password', 'INVALID_CREDENTIALS');
  }

  const token = generateToken({ id: doctor.id, email: doctor.email, role: 'doctor' });

  // lastLogin/updatedAt tracking is best-effort and must never delay the
  // login response. Fire the Firestore write in the background instead of
  // awaiting it - this removes an unnecessary write from the critical path.
  updateDocument(COLLECTIONS.DOCTORS, doctor.id, {
    ...doctor,
    lastLogin: nowIso(),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  })
    .then((updated) => {
      cacheDoctorRecord(doctor.id, updated);
    })
    .catch((error) => {
      logger.error('Failed to update lastLogin after login', {
        doctorId: doctor.id,
        error: error?.message || error
      });
    });

  await recordSchedulingLog({
    type: 'auth.doctor.login',
    message: 'Doctor logged in',
    entityType: 'doctor',
    entityId: doctor.id,
    doctorId: doctor.id,
    requestId: requestContext.requestId,
    metadata: { email: doctor.email }
  });

  return { doctor: sanitizeDoctor(doctor), token };
}

export async function getCurrentDoctorProfile(doctorId) {
  if (!doctorId) {
    throw createError(401, 'Not authenticated', 'UNAUTHENTICATED');
  }

  const cached = getDoctorRecordCache(doctorId);
  const doctor = cached || (await getDocument(COLLECTIONS.DOCTORS, doctorId));
  if (!doctor || doctor.isDeleted) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  return sanitizeDoctor(doctor);
}

/**
 * Updates a doctor's own profile. Email and password cannot be changed
 * here - use /auth/change-password for the password, and email changes
 * are intentionally not allowed to avoid breaking the login identity.
 */
export async function updateDoctorProfile(doctorId, payload, requestContext = {}) {
  const {
    email, // eslint-disable-line no-unused-vars
    password, // eslint-disable-line no-unused-vars
    passwordHash, // eslint-disable-line no-unused-vars
    isDeleted, // eslint-disable-line no-unused-vars
    status, // eslint-disable-line no-unused-vars
    ...safePayload
  } = payload || {};

  const updated = await updateDoctorRecord(doctorId, safePayload, requestContext);
  return sanitizeDoctor(updated);
}

export async function changeDoctorPassword(doctorId, payload, requestContext = {}) {
  ensureFields(payload, ['oldPassword', 'newPassword'], 'change password');

  if (payload.newPassword.length < 6) {
    throw createError(400, 'New password must be at least 6 characters long', 'VALIDATION_ERROR');
  }

  const doctor = await getDocument(COLLECTIONS.DOCTORS, doctorId);
  if (!doctor || doctor.isDeleted) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  if (!doctor.passwordHash) {
    throw createError(401, 'This account has no password set. Please contact support.', 'PASSWORD_NOT_SET');
  }

  const oldPasswordMatches = await bcrypt.compare(payload.oldPassword, doctor.passwordHash);
  if (!oldPasswordMatches) {
    throw createError(401, 'Current password is incorrect', 'INVALID_CREDENTIALS');
  }

  const newPasswordHash = await bcrypt.hash(payload.newPassword, SALT_ROUNDS);
  const updated = await updateDocument(COLLECTIONS.DOCTORS, doctorId, {
    ...doctor,
    passwordHash: newPasswordHash,
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  cacheDoctorRecord(doctorId, updated);
  invalidateByPrefix(`doctor:${doctorId}:availability`);

  await recordSchedulingLog({
    type: 'auth.doctor.passwordChanged',
    message: 'Doctor changed their password',
    entityType: 'doctor',
    entityId: doctorId,
    doctorId,
    requestId: requestContext.requestId
  });

  return { changed: true };
}