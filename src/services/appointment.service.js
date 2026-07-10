import { COLLECTIONS, APPOINTMENT_STATUS, QUEUE_NAMES, JOB_TYPES } from '../utils/constants.js';
import {
  addDocument,
  deleteDocument,
  getDocument,
  queryDocuments,
  updateDocument
} from './firestore.service.js';
import {
  createError,
  ensureFields,
  dateOnly,
  getDayOfWeek,
  normalizeIsoDateTime,
  nowIso,
  nowMs,
  overlaps,
  parseBool,
  parsePositiveInt,
  timeOnly,
  toMinutes,
  uuid
} from '../utils/helpers.js';
import { getDoctorById } from './doctor.service.js';
import {
  cacheAppointmentRecord,
  getAppointmentRecordCache,
  invalidateByPrefix
} from './cache.service.js';
import { recordSchedulingLog } from './log.service.js';
import { enqueueJob, scheduleDebouncedJob } from '../queue/queue.service.js';
import { detectGoogleConflicts } from './google.service.js';

function normalizeAppointment(payload, existing = null) {
  return {
    doctorId: payload.doctorId || existing?.doctorId || '',
    patientId: payload.patientId || existing?.patientId || null,
    patientName: payload.patientName || existing?.patientName || '',
    patientEmail: payload.patientEmail || existing?.patientEmail || '',
    patientPhone: payload.patientPhone || existing?.patientPhone || '',
    title: payload.title || existing?.title || `${payload.patientName || existing?.patientName || 'Patient'} Appointment`,
    notes: payload.notes || existing?.notes || '',
    timezone: payload.timezone || existing?.timezone || 'UTC',
    startTime: normalizeIsoDateTime(payload.startTime || existing?.startTime),
    endTime: normalizeIsoDateTime(payload.endTime || existing?.endTime),
    status: payload.status || existing?.status || APPOINTMENT_STATUS.SCHEDULED,
    zoomEnabled: payload.zoomEnabled ?? existing?.zoomEnabled ?? true,
    googleSyncEnabled: payload.googleSyncEnabled ?? existing?.googleSyncEnabled ?? true,
    channel: payload.channel || existing?.channel || 'web',
    reason: payload.reason || existing?.reason || '',
    metadata: payload.metadata || existing?.metadata || {}
  };
}

async function getAppointmentsForDoctor(doctorId) {
  const records = await queryDocuments(COLLECTIONS.APPOINTMENTS, [['doctorId', '==', doctorId]]);
  return records
    .filter((appointment) => !appointment.isDeleted)
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
}

async function detectLocalConflicts(doctorId, startTime, endTime, ignoreAppointmentId = null) {
  const appointments = await getAppointmentsForDoctor(doctorId);
  return appointments.filter((appointment) => {
    if (ignoreAppointmentId && appointment.id === ignoreAppointmentId) return false;
    if (![APPOINTMENT_STATUS.SCHEDULED, APPOINTMENT_STATUS.RESCHEDULED, APPOINTMENT_STATUS.PENDING].includes(appointment.status)) {
      return false;
    }
    return overlaps(
      { start: appointment.startTime, end: appointment.endTime },
      { start: startTime, end: endTime }
    );
  });
}

function isWithinWorkingHours(doctor, startTime, endTime) {
  const timezone = doctor.timezone || 'UTC';
  const localDate = dateOnly(startTime, timezone);
  if ((doctor.leaveDays || []).includes(localDate)) {
    return false;
  }

  const weekday = getDayOfWeek(startTime, timezone);
  const localStart = toMinutes(timeOnly(startTime, timezone));
  const localEnd = toMinutes(timeOnly(endTime, timezone));
  const windows = (doctor.workingHours || []).filter((entry) => entry.enabled !== false && Number(entry.dayOfWeek) === weekday);

  if (windows.length === 0) {
    return false;
  }

  return windows.some((window) => {
    const windowStart = toMinutes(window.start);
    const windowEnd = toMinutes(window.end);
    return localStart >= windowStart && localEnd <= windowEnd;
  });
}

async function ensureAppointmentSlotAvailable({ doctor, startTime, endTime, appointmentId = null }) {
  const localConflicts = await detectLocalConflicts(doctor.id, startTime, endTime, appointmentId);
  if (localConflicts.length > 0) {
    throw createError(409, 'Appointment conflicts with an existing appointment', 'APPOINTMENT_CONFLICT', {
      conflicts: localConflicts.map((appointment) => appointment.id)
    });
  }

  if (doctor.googleOwnerId && doctor.googleCalendarId) {
    try {
      const googleConflicts = await detectGoogleConflicts({
        ownerId: doctor.googleOwnerId,
        calendarId: doctor.googleCalendarId,
        startTime,
        endTime
      });
      if (googleConflicts.length > 0) {
        throw createError(409, 'Appointment conflicts with Google Calendar availability', 'GOOGLE_CONFLICT', {
          conflicts: googleConflicts.map((event) => event.id)
        });
      }
    } catch (error) {
      if (error.statusCode === 409) {
        throw error;
      }
      // Google sync is optional, so conflict detection failures should not block booking when the calendar is unavailable.
    }
  }
}

async function saveAppointment(record) {
  const appointment = await updateDocument(COLLECTIONS.APPOINTMENTS, record.id, record);
  cacheAppointmentRecord(appointment.id, appointment);
  invalidateByPrefix(`doctor:${appointment.doctorId}:availability`);
  return appointment;
}

export async function bookAppointment(payload, requestContext = {}) {
  ensureFields(payload, ['doctorId', 'patientName', 'patientEmail', 'startTime', 'endTime'], 'appointment');
  const doctor = await getDoctorById(payload.doctorId);
  if (!doctor) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }
  if (doctor.isDeleted || doctor.status === 'inactive') {
    throw createError(409, 'Doctor is not available for booking', 'DOCTOR_INACTIVE');
  }

  const startTime = normalizeIsoDateTime(payload.startTime);
  const endTime = normalizeIsoDateTime(payload.endTime);
  if (!startTime || !endTime) {
    throw createError(400, 'startTime and endTime must be valid ISO timestamps', 'VALIDATION_ERROR');
  }
  if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
    throw createError(400, 'endTime must be after startTime', 'VALIDATION_ERROR');
  }
  if (!isWithinWorkingHours(doctor, startTime, endTime)) {
    throw createError(409, 'Appointment is outside the doctor working hours or on a leave day', 'OUTSIDE_WORKING_HOURS');
  }

  await ensureAppointmentSlotAvailable({ doctor, startTime, endTime });

  const id = payload.id || uuid();
  const record = {
    id,
    ...normalizeAppointment({ ...payload, startTime, endTime }),
    status: APPOINTMENT_STATUS.SCHEDULED,
    version: 1,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs(),
    googleEventId: null,
    zoomMeetingId: null,
    joinUrl: null,
    startUrl: null
  };

  const appointment = await addDocument(COLLECTIONS.APPOINTMENTS, record);
  cacheAppointmentRecord(appointment.id, appointment);

  await recordSchedulingLog({
    type: 'appointment.created',
    message: 'Appointment booked',
    entityType: 'appointment',
    entityId: appointment.id,
    doctorId: doctor.id,
    appointmentId: appointment.id,
    requestId: requestContext.requestId,
    metadata: {
      patientEmail: appointment.patientEmail,
      startTime: appointment.startTime,
      endTime: appointment.endTime
    }
  });

  enqueueJob(QUEUE_NAMES.GOOGLE_SYNC, JOB_TYPES.CALENDAR_SYNC, {
    action: 'create',
    appointmentId: appointment.id,
    doctorId: doctor.id
  });

  if (appointment.zoomEnabled) {
    enqueueJob(QUEUE_NAMES.ZOOM_SYNC, JOB_TYPES.ZOOM_MEETING_CREATE, {
      appointmentId: appointment.id,
      doctorId: doctor.id
    });
  }

  enqueueJob(QUEUE_NAMES.NOTIFICATIONS, JOB_TYPES.NOTIFICATION_SEND, {
    doctorId: doctor.id,
    appointmentId: appointment.id,
    userId: appointment.patientId,
    type: 'appointment.created',
    title: 'Appointment booked',
    message: `Appointment booked for ${appointment.patientName}`,
    metadata: {
      startTime: appointment.startTime,
      endTime: appointment.endTime
    }
  });

  return appointment;
}

export async function getAppointmentById(appointmentId) {
  if (!appointmentId) return null;
  const cached = getAppointmentRecordCache(appointmentId);
  if (cached) {
    return cached;
  }
  const record = await getDocument(COLLECTIONS.APPOINTMENTS, appointmentId);
  if (!record) return null;
  cacheAppointmentRecord(appointmentId, record);
  return record;
}

export async function listAppointments(filters = {}) {
  let records = await queryDocuments(COLLECTIONS.APPOINTMENTS, []);

  if (filters.doctorId) {
    records = records.filter((record) => record.doctorId === filters.doctorId);
  }
  if (filters.patientId) {
    records = records.filter((record) => record.patientId === filters.patientId);
  }
  if (filters.status) {
    records = records.filter((record) => record.status === filters.status);
  }
  if (filters.from) {
    records = records.filter((record) => new Date(record.startTime).getTime() >= new Date(filters.from).getTime());
  }
  if (filters.to) {
    records = records.filter((record) => new Date(record.endTime).getTime() <= new Date(filters.to).getTime());
  }
  if (filters.search) {
    const needle = String(filters.search).toLowerCase();
    records = records.filter((record) => {
      return [record.patientName, record.patientEmail, record.reason, record.title].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }

  return records
    .filter((record) => !record.isDeleted)
    .sort((left, right) => new Date(right.startTime).getTime() - new Date(left.startTime).getTime());
}

export async function cancelAppointment(appointmentId, payload = {}, requestContext = {}) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) {
    throw createError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  const updated = await saveAppointment({
    ...appointment,
    status: APPOINTMENT_STATUS.CANCELLED,
    cancelledAt: nowIso(),
    cancelledReason: payload.reason || appointment.cancelledReason || '',
    cancelledBy: payload.cancelledBy || requestContext.userId || null,
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  enqueueJob(QUEUE_NAMES.GOOGLE_SYNC, JOB_TYPES.CALENDAR_SYNC, {
    action: 'delete',
    appointmentId: updated.id,
    doctorId: updated.doctorId
  });

  if (updated.zoomMeetingId) {
    enqueueJob(QUEUE_NAMES.ZOOM_SYNC, JOB_TYPES.ZOOM_MEETING_DELETE, {
      appointmentId: updated.id,
      doctorId: updated.doctorId,
      meetingId: updated.zoomMeetingId
    });
  }

  enqueueJob(QUEUE_NAMES.NOTIFICATIONS, JOB_TYPES.NOTIFICATION_SEND, {
    doctorId: updated.doctorId,
    appointmentId: updated.id,
    userId: updated.patientId,
    type: 'appointment.cancelled',
    title: 'Appointment cancelled',
    message: `Appointment cancelled for ${updated.patientName}`,
    metadata: {
      reason: updated.cancelledReason
    }
  });

  await recordSchedulingLog({
    type: 'appointment.cancelled',
    message: 'Appointment cancelled',
    entityType: 'appointment',
    entityId: updated.id,
    doctorId: updated.doctorId,
    appointmentId: updated.id,
    requestId: requestContext.requestId,
    metadata: {
      reason: updated.cancelledReason
    }
  });

  invalidateByPrefix(`doctor:${updated.doctorId}:availability`);
  return updated;
}

export async function rescheduleAppointment(appointmentId, payload = {}, requestContext = {}) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) {
    throw createError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  const doctor = await getDoctorById(appointment.doctorId);
  if (!doctor) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  const startTime = normalizeIsoDateTime(payload.startTime || appointment.startTime);
  const endTime = normalizeIsoDateTime(payload.endTime || appointment.endTime);
  if (!startTime || !endTime) {
    throw createError(400, 'startTime and endTime must be valid ISO timestamps', 'VALIDATION_ERROR');
  }
  if (new Date(startTime).getTime() >= new Date(endTime).getTime()) {
    throw createError(400, 'endTime must be after startTime', 'VALIDATION_ERROR');
  }
  if (!isWithinWorkingHours(doctor, startTime, endTime)) {
    throw createError(409, 'Appointment is outside the doctor working hours or on a leave day', 'OUTSIDE_WORKING_HOURS');
  }

  await ensureAppointmentSlotAvailable({
    doctor,
    startTime,
    endTime,
    appointmentId
  });

  const updated = await saveAppointment({
    ...appointment,
    ...normalizeAppointment({ ...appointment, ...payload, startTime, endTime }, appointment),
    status: APPOINTMENT_STATUS.RESCHEDULED,
    version: (appointment.version || 1) + 1,
    startTime,
    endTime,
    rescheduledAt: nowIso(),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  scheduleDebouncedJob(QUEUE_NAMES.GOOGLE_SYNC, `appointment:${appointmentId}`, JOB_TYPES.CALENDAR_SYNC, {
    action: 'update',
    appointmentId: updated.id,
    doctorId: updated.doctorId
  }, 1000);

  if (parseBool(updated.zoomEnabled, true)) {
    scheduleDebouncedJob(QUEUE_NAMES.ZOOM_SYNC, `appointment:${appointmentId}`, JOB_TYPES.ZOOM_MEETING_UPDATE, {
      appointmentId: updated.id,
      doctorId: updated.doctorId,
      meetingId: updated.zoomMeetingId || null
    }, 1000);
  }

  enqueueJob(QUEUE_NAMES.NOTIFICATIONS, JOB_TYPES.NOTIFICATION_SEND, {
    doctorId: updated.doctorId,
    appointmentId: updated.id,
    userId: updated.patientId,
    type: 'appointment.rescheduled',
    title: 'Appointment rescheduled',
    message: `Appointment rescheduled for ${updated.patientName}`,
    metadata: {
      startTime: updated.startTime,
      endTime: updated.endTime
    }
  });

  await recordSchedulingLog({
    type: 'appointment.rescheduled',
    message: 'Appointment rescheduled',
    entityType: 'appointment',
    entityId: updated.id,
    doctorId: updated.doctorId,
    appointmentId: updated.id,
    requestId: requestContext.requestId,
    metadata: {
      startTime: updated.startTime,
      endTime: updated.endTime
    }
  });

  invalidateByPrefix(`doctor:${updated.doctorId}:availability`);
  return updated;
}

export async function updateAppointmentMetadata(appointmentId, payload = {}, requestContext = {}) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) {
    throw createError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  const updated = await saveAppointment({
    ...appointment,
    ...payload,
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  await recordSchedulingLog({
    type: 'appointment.updated',
    message: 'Appointment metadata updated',
    entityType: 'appointment',
    entityId: updated.id,
    doctorId: updated.doctorId,
    appointmentId: updated.id,
    requestId: requestContext.requestId,
    metadata: payload
  });

  return updated;
}

export async function deleteAppointment(appointmentId, requestContext = {}) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) {
    throw createError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  await updateDocument(COLLECTIONS.APPOINTMENTS, appointmentId, {
    ...appointment,
    isDeleted: true,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });
  cacheAppointmentRecord(appointmentId, null);
  invalidateByPrefix(`doctor:${appointment.doctorId}:availability`);

  await recordSchedulingLog({
    type: 'appointment.deleted',
    message: 'Appointment deleted',
    entityType: 'appointment',
    entityId: appointmentId,
    doctorId: appointment.doctorId,
    appointmentId,
    requestId: requestContext.requestId
  });

  return { deleted: true };
}

export async function getAppointmentSummary(appointmentId) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) return null;
  return {
    id: appointment.id,
    doctorId: appointment.doctorId,
    patientId: appointment.patientId,
    patientName: appointment.patientName,
    patientEmail: appointment.patientEmail,
    startTime: appointment.startTime,
    endTime: appointment.endTime,
    status: appointment.status,
    googleEventId: appointment.googleEventId || null,
    zoomMeetingId: appointment.zoomMeetingId || null,
    joinUrl: appointment.joinUrl || null,
    startUrl: appointment.startUrl || null
  };
}
