import { COLLECTIONS, DEFAULT_WORKING_HOURS, DEFAULT_SLOT_MINUTES } from '../utils/constants.js';
import {
  addDocument,
  deleteDocument,
  getDocument,
  queryDocuments,
  setDocument,
  updateDocument
} from './firestore.service.js';
import {
  buildTimeSlots,
  createError,
  dateOnly,
  docData,
  ensureFields,
  getDayOfWeek,
  nowIso,
  nowMs,
  overlaps,
  parsePositiveInt,
  safeNumber,
  startOfDayIso,
  endOfDayIso,
  uuid,
  withDefaultWorkingHours
} from '../utils/helpers.js';
import {
  cacheDoctorRecord,
  getDoctorRecordCache,
  cacheDoctorAvailability,
  getDoctorAvailabilityCache,
  invalidateByPrefix
} from './cache.service.js';
import { recordSchedulingLog } from './log.service.js';

function normalizeDoctorPayload(payload, existing = null) {
  return {
    name: payload.name || existing?.name || '',
    specialization: payload.specialization || existing?.specialization || '',
    email: payload.email || existing?.email || '',
    phone: payload.phone || existing?.phone || '',
    timezone: payload.timezone || existing?.timezone || 'UTC',
    workingHours: withDefaultWorkingHours(payload.workingHours || existing?.workingHours || DEFAULT_WORKING_HOURS),
    leaveDays: Array.isArray(payload.leaveDays) ? payload.leaveDays : existing?.leaveDays || [],
    appointmentDurationMinutes: safeNumber(payload.appointmentDurationMinutes ?? existing?.appointmentDurationMinutes, DEFAULT_SLOT_MINUTES),
    status: payload.status || existing?.status || 'active',
    isDeleted: payload.isDeleted ?? existing?.isDeleted ?? false,
    googleCalendarId: payload.googleCalendarId || existing?.googleCalendarId || 'primary',
    googleOwnerId: payload.googleOwnerId || existing?.googleOwnerId || payload.id || existing?.id || null,
    zoomEnabled: payload.zoomEnabled ?? existing?.zoomEnabled ?? true,
    notes: payload.notes || existing?.notes || ''
  };
}

export async function createDoctor(payload, requestContext = {}) {
  ensureFields(payload, ['name', 'specialization', 'email'], 'doctor');
  const id = payload.id || uuid();
  const record = {
    id,
    ...normalizeDoctorPayload(payload),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs()
  };
  const doctor = await setDocument(COLLECTIONS.DOCTORS, id, record, false);
  cacheDoctorRecord(id, doctor);
  invalidateByPrefix(`doctor:${id}:availability`);
  await recordSchedulingLog({
    type: 'doctor.created',
    message: 'Doctor created',
    entityType: 'doctor',
    entityId: id,
    doctorId: id,
    requestId: requestContext.requestId,
    metadata: {
      specialization: doctor.specialization
    }
  });
  return doctor;
}

export async function updateDoctor(doctorId, payload, requestContext = {}) {
  const existing = await getDoctorById(doctorId);
  if (!existing) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }
  const merged = {
    ...existing,
    ...normalizeDoctorPayload(payload, existing),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  };
  const doctor = await updateDocument(COLLECTIONS.DOCTORS, doctorId, merged);
  cacheDoctorRecord(doctorId, doctor);
  invalidateByPrefix(`doctor:${doctorId}:availability`);
  await recordSchedulingLog({
    type: 'doctor.updated',
    message: 'Doctor updated',
    entityType: 'doctor',
    entityId: doctorId,
    doctorId,
    requestId: requestContext.requestId,
    metadata: {
      specialization: doctor.specialization
    }
  });
  return doctor;
}

export async function deleteDoctor(doctorId, requestContext = {}, options = {}) {
  const existing = await getDoctorById(doctorId);
  if (!existing) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  if (options.hardDelete) {
    await deleteDocument(COLLECTIONS.DOCTORS, doctorId);
  } else {
    await updateDocument(COLLECTIONS.DOCTORS, doctorId, {
      ...existing,
      isDeleted: true,
      status: 'inactive',
      updatedAt: nowIso(),
      updatedAtMs: nowMs()
    });
  }

  cacheDoctorRecord(doctorId, null);
  invalidateByPrefix(`doctor:${doctorId}:availability`);
  await recordSchedulingLog({
    type: 'doctor.deleted',
    message: options.hardDelete ? 'Doctor hard deleted' : 'Doctor soft deleted',
    entityType: 'doctor',
    entityId: doctorId,
    doctorId,
    requestId: requestContext.requestId,
    metadata: { hardDelete: Boolean(options.hardDelete) }
  });

  return { deleted: true, hardDelete: Boolean(options.hardDelete) };
}

export async function getDoctorById(doctorId) {
  if (!doctorId) return null;
  const cached = getDoctorRecordCache(doctorId);
  if (cached) {
    return cached;
  }

  const record = await getDocument(COLLECTIONS.DOCTORS, doctorId);
  if (!record) {
    return null;
  }

  cacheDoctorRecord(doctorId, record);
  return record;
}

export async function listDoctors(filters = {}) {
  let records = await queryDocuments(COLLECTIONS.DOCTORS, []);

  if (filters.status) {
    records = records.filter((doctor) => doctor.status === filters.status);
  }

  if (filters.specialization) {
    const needle = String(filters.specialization).toLowerCase();
    records = records.filter((doctor) => String(doctor.specialization || '').toLowerCase().includes(needle));
  }

  if (filters.search) {
    const needle = String(filters.search).toLowerCase();
    records = records.filter((doctor) => {
      return [doctor.name, doctor.email, doctor.specialization].some((value) => String(value || '').toLowerCase().includes(needle));
    });
  }

  return records
    .filter((doctor) => !doctor.isDeleted)
    .sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0));
}

export async function addLeaveDay(doctorId, dateValue, requestContext = {}) {
  const doctor = await getDoctorById(doctorId);
  if (!doctor) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  const leaveDays = Array.from(new Set([...(doctor.leaveDays || []), dateValue]));
  const updated = await updateDocument(COLLECTIONS.DOCTORS, doctorId, {
    ...doctor,
    leaveDays,
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });
  cacheDoctorRecord(doctorId, updated);
  invalidateByPrefix(`doctor:${doctorId}:availability`);

  await recordSchedulingLog({
    type: 'doctor.leaveDay.added',
    message: 'Leave day added',
    entityType: 'doctor',
    entityId: doctorId,
    doctorId,
    requestId: requestContext.requestId,
    metadata: { dateValue }
  });

  return updated;
}

export async function removeLeaveDay(doctorId, dateValue, requestContext = {}) {
  const doctor = await getDoctorById(doctorId);
  if (!doctor) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  const leaveDays = (doctor.leaveDays || []).filter((entry) => entry !== dateValue);
  const updated = await updateDocument(COLLECTIONS.DOCTORS, doctorId, {
    ...doctor,
    leaveDays,
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });
  cacheDoctorRecord(doctorId, updated);
  invalidateByPrefix(`doctor:${doctorId}:availability`);

  await recordSchedulingLog({
    type: 'doctor.leaveDay.removed',
    message: 'Leave day removed',
    entityType: 'doctor',
    entityId: doctorId,
    doctorId,
    requestId: requestContext.requestId,
    metadata: { dateValue }
  });

  return updated;
}

export async function getDoctorAvailability(doctorId, dateValue, options = {}) {
  const doctor = await getDoctorById(doctorId);
  if (!doctor) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  const slotMinutes = parsePositiveInt(options.slotMinutes, doctor.appointmentDurationMinutes || DEFAULT_SLOT_MINUTES, 5, 180);
  const dateKey = dateValue;
  const cacheKey = getDoctorAvailabilityCache(doctorId, `${dateKey}:${slotMinutes}`);
  if (cacheKey) {
    return cacheKey;
  }

  if ((doctor.leaveDays || []).includes(dateKey)) {
    const emptyResult = {
      doctorId,
      date: dateKey,
      timezone: doctor.timezone || 'UTC',
      slotMinutes,
      workingHours: doctor.workingHours || [],
      unavailableReason: 'leave_day',
      slots: []
    };
    cacheDoctorAvailability(doctorId, `${dateKey}:${slotMinutes}`, emptyResult);
    return emptyResult;
  }

  const appointments = (await queryDocuments(COLLECTIONS.APPOINTMENTS, [['doctorId', '==', doctorId]])).sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  const activeAppointments = appointments.filter((appointment) => ['scheduled', 'rescheduled', 'pending'].includes(appointment.status));

  const [year, month, day] = dateKey.split('-').map((value) => Number.parseInt(value, 10));
  const dateObject = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));
  const weekday = getDayOfWeek(dateObject, doctor.timezone || 'UTC');
  const workingHours = (doctor.workingHours || []).filter((entry) => entry.enabled !== false && Number(entry.dayOfWeek) === weekday);

  const dayStart = startOfDayIso(dateObject, doctor.timezone || 'UTC');
  const dayEnd = endOfDayIso(dateObject, doctor.timezone || 'UTC');
  const dayAppointments = activeAppointments.filter((appointment) => overlaps(
    { start: appointment.startTime, end: appointment.endTime },
    { start: dayStart, end: dayEnd }
  ));

  const slots = [];
  for (const window of workingHours) {
    const windowSlots = buildTimeSlots({
      date: { year, month, day },
      timeZone: doctor.timezone || 'UTC',
      startTime: window.start,
      endTime: window.end,
      slotMinutes
    });

    for (const slot of windowSlots) {
      const conflict = dayAppointments.some((appointment) => overlaps(
        { start: slot.startTime, end: slot.endTime },
        { start: appointment.startTime, end: appointment.endTime }
      ));
      slots.push({
        ...slot,
        available: !conflict
      });
    }
  }

  const result = {
    doctorId,
    date: dateKey,
    timezone: doctor.timezone || 'UTC',
    slotMinutes,
    workingHours,
    slots
  };

  cacheDoctorAvailability(doctorId, `${dateKey}:${slotMinutes}`, result);
  return result;
}

export async function listDoctorAppointments(doctorId) {
  const appointments = await queryDocuments(COLLECTIONS.APPOINTMENTS, [['doctorId', '==', doctorId]]);
  return appointments
    .filter((appointment) => !appointment.isDeleted)
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
}
