import { COLLECTIONS, QUEUE_NAMES, JOB_TYPES } from '../utils/constants.js';
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
  nowIso,
  nowMs,
  normalizeIsoDateTime,
  overlaps,
  uuid
} from '../utils/helpers.js';
import {
  createGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
  exchangeGoogleAuthCode,
  listGoogleCalendarEvents,
  stopGoogleCalendarWatch,
  updateGoogleCalendarEvent,
  watchGoogleCalendar,
  convertGoogleEventToLocal
} from './google.service.js';
import { enqueueJob } from '../queue/queue.service.js';
import { recordSchedulingLog } from './log.service.js';
import { getDoctorById } from './doctor.service.js';
import { getAppointmentById } from './appointment.service.js';
import { cacheCalendarEvents, getCalendarEventsCache, invalidateByPrefix } from './cache.service.js';

function normalizeCalendarEvent(payload, existing = null) {
  return {
    doctorId: payload.doctorId || existing?.doctorId || null,
    appointmentId: payload.appointmentId || existing?.appointmentId || null,
    title: payload.title || existing?.title || 'Calendar event',
    description: payload.description || existing?.description || '',
    location: payload.location || existing?.location || '',
    startTime: normalizeIsoDateTime(payload.startTime || existing?.startTime),
    endTime: normalizeIsoDateTime(payload.endTime || existing?.endTime),
    timezone: payload.timezone || existing?.timezone || 'UTC',
    attendees: Array.isArray(payload.attendees) ? payload.attendees : existing?.attendees || [],
    status: payload.status || existing?.status || 'confirmed',
    syncWithGoogle: payload.syncWithGoogle ?? existing?.syncWithGoogle ?? true,
    metadata: payload.metadata || existing?.metadata || {}
  };
}

export async function connectGoogleAccount(payload, requestContext = {}) {
  ensureFields(payload, ['ownerId', 'code', 'redirectUri'], 'google connect');
  const record = await exchangeGoogleAuthCode({
    ownerId: payload.ownerId,
    code: payload.code,
    redirectUri: payload.redirectUri
  });

const doctorId = payload.doctorId || payload.ownerId;

const doctor = await getDoctorById(doctorId);

if (doctor) {
  await updateDocument(COLLECTIONS.DOCTORS, doctorId, {
    ...doctor,
    googleOwnerId: payload.ownerId,
    googleCalendarId: payload.calendarId || doctor.googleCalendarId || 'primary',
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });
}

  await recordSchedulingLog({
    type: 'google.connected',
    message: 'Google account connected',
    entityType: 'googleTokens',
    entityId: payload.ownerId,
    requestId: requestContext.requestId,
    metadata: {
      doctorId: payload.doctorId || null,
      calendarId: payload.calendarId || null
    }
  });

  return record;
}

export async function createCalendarEvent(payload, requestContext = {}) {
  ensureFields(payload, ['doctorId', 'title', 'startTime', 'endTime'], 'calendar event');
  const doctor = await getDoctorById(payload.doctorId);
  if (!doctor) {
    throw createError(404, 'Doctor not found', 'DOCTOR_NOT_FOUND');
  }

  const record = {
    id: payload.id || uuid(),
    ...normalizeCalendarEvent(payload),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs(),
    googleEventId: null
  };

  const event = await addDocument(COLLECTIONS.CALENDAR_EVENTS, record);
  invalidateByPrefix('calendar:events:');

  if (record.syncWithGoogle && doctor.googleOwnerId && doctor.googleCalendarId) {
    enqueueJob(QUEUE_NAMES.GOOGLE_SYNC, JOB_TYPES.CALENDAR_EVENT_CREATE, {
      doctorId: doctor.id,
      event: event
    });
  }

  await recordSchedulingLog({
    type: 'calendar.event.created',
    message: 'Calendar event created',
    entityType: 'calendarEvent',
    entityId: event.id,
    doctorId: doctor.id,
    appointmentId: event.appointmentId,
    requestId: requestContext.requestId,
    metadata: {
      startTime: event.startTime,
      endTime: event.endTime
    }
  });

  return event;
}

export async function updateCalendarEvent(eventId, payload, requestContext = {}) {
  const existing = await getDocument(COLLECTIONS.CALENDAR_EVENTS, eventId);
  if (!existing) {
    throw createError(404, 'Calendar event not found', 'CALENDAR_EVENT_NOT_FOUND');
  }

  const updated = await updateDocument(COLLECTIONS.CALENDAR_EVENTS, eventId, {
    ...existing,
    ...normalizeCalendarEvent(payload, existing),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  invalidateByPrefix('calendar:events:');
  if (updated.syncWithGoogle && updated.doctorId) {
    enqueueJob(QUEUE_NAMES.GOOGLE_SYNC, JOB_TYPES.CALENDAR_EVENT_UPDATE, {
      doctorId: updated.doctorId,
      event: updated
    });
  }

  await recordSchedulingLog({
    type: 'calendar.event.updated',
    message: 'Calendar event updated',
    entityType: 'calendarEvent',
    entityId: updated.id,
    doctorId: updated.doctorId,
    appointmentId: updated.appointmentId,
    requestId: requestContext.requestId,
    metadata: payload
  });

  return updated;
}

export async function deleteCalendarEvent(eventId, requestContext = {}) {
  const existing = await getDocument(COLLECTIONS.CALENDAR_EVENTS, eventId);
  if (!existing) {
    throw createError(404, 'Calendar event not found', 'CALENDAR_EVENT_NOT_FOUND');
  }

  await updateDocument(COLLECTIONS.CALENDAR_EVENTS, eventId, {
    ...existing,
    isDeleted: true,
    deletedAt: nowIso(),
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });
  invalidateByPrefix('calendar:events:');

  if (existing.syncWithGoogle && existing.doctorId) {
    enqueueJob(QUEUE_NAMES.GOOGLE_SYNC, JOB_TYPES.CALENDAR_EVENT_DELETE, {
      doctorId: existing.doctorId,
      event: existing
    });
  }

  await recordSchedulingLog({
    type: 'calendar.event.deleted',
    message: 'Calendar event deleted',
    entityType: 'calendarEvent',
    entityId: existing.id,
    doctorId: existing.doctorId,
    appointmentId: existing.appointmentId,
    requestId: requestContext.requestId
  });

  return { deleted: true };
}

export async function listCalendarEvents(filters = {}) {
  const cacheKey = JSON.stringify(filters);
  const cached = getCalendarEventsCache(cacheKey);
  if (cached) {
    return cached;
  }

  let records = await queryDocuments(COLLECTIONS.CALENDAR_EVENTS, []);

  if (filters.doctorId) {
    records = records.filter((record) => record.doctorId === filters.doctorId);
  }
  if (filters.appointmentId) {
    records = records.filter((record) => record.appointmentId === filters.appointmentId);
  }
  if (filters.from) {
    records = records.filter((record) => new Date(record.startTime).getTime() >= new Date(filters.from).getTime());
  }
  if (filters.to) {
    records = records.filter((record) => new Date(record.endTime).getTime() <= new Date(filters.to).getTime());
  }

  const result = records
    .filter((record) => !record.isDeleted)
    .sort((left, right) => new Date(left.startTime).getTime() - new Date(right.startTime).getTime());
  cacheCalendarEvents(cacheKey, result);
  return result;
}

export async function syncAppointmentToGoogle({ appointmentId, action = 'create' }) {
  const appointment = await getAppointmentById(appointmentId);
  if (!appointment) {
    throw createError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
  }

  const doctor = await getDoctorById(appointment.doctorId);
  if (!doctor || !doctor.googleOwnerId || !doctor.googleCalendarId) {
    return { synced: false, reason: 'google_not_configured' };
  }

  const eventPayload = {
    summary: appointment.title || `Appointment with ${appointment.patientName}`,
    description: appointment.notes || `Appointment for ${appointment.patientName}`,
    start: {
      dateTime: appointment.startTime,
      timeZone: appointment.timezone || doctor.timezone || 'UTC'
    },
    end: {
      dateTime: appointment.endTime,
      timeZone: appointment.timezone || doctor.timezone || 'UTC'
    },
    attendees: [
      { email: appointment.patientEmail }
    ]
  };

  let googleEvent = null;
  if (action === 'create') {
    googleEvent = await createGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, eventPayload);
    await updateDocument(COLLECTIONS.APPOINTMENTS, appointment.id, {
      ...appointment,
      googleEventId: googleEvent.id,
      updatedAt: nowIso(),
      updatedAtMs: nowMs()
    });
  } else if (action === 'update') {
    if (appointment.googleEventId) {
      googleEvent = await updateGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, appointment.googleEventId, eventPayload);
    } else {
      googleEvent = await createGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, eventPayload);
      await updateDocument(COLLECTIONS.APPOINTMENTS, appointment.id, {
        ...appointment,
        googleEventId: googleEvent.id,
        updatedAt: nowIso(),
        updatedAtMs: nowMs()
      });
    }
  } else if (action === 'delete' && appointment.googleEventId) {
    await deleteGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, appointment.googleEventId);
    googleEvent = { deleted: true };
  }

  if (googleEvent && googleEvent.id) {
    await addDocument(COLLECTIONS.CALENDAR_EVENTS, {
      id: `appointment:${appointment.id}`,
      appointmentId: appointment.id,
      doctorId: doctor.id,
      googleEventId: googleEvent.id,
      summary: googleEvent.summary || eventPayload.summary,
      startTime: eventPayload.start.dateTime,
      endTime: eventPayload.end.dateTime,
      status: googleEvent.status || 'confirmed',
      rawEvent: googleEvent,
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdAtMs: nowMs(),
      updatedAtMs: nowMs()
    });
  } else if (action === 'delete') {
    await addDocument(COLLECTIONS.CALENDAR_EVENTS, {
      id: `appointment:${appointment.id}`,
      appointmentId: appointment.id,
      doctorId: doctor.id,
      googleEventId: appointment.googleEventId || null,
      summary: eventPayload.summary,
      startTime: eventPayload.start.dateTime,
      endTime: eventPayload.end.dateTime,
      status: 'cancelled',
      rawEvent: googleEvent,
      isDeleted: true,
      deletedAt: nowIso(),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      createdAtMs: nowMs(),
      updatedAtMs: nowMs()
    });
  }

  invalidateByPrefix('calendar:events:');

  await recordSchedulingLog({
    type: `google.calendar.${action}`,
    message: `Google calendar ${action}`,
    entityType: 'appointment',
    entityId: appointment.id,
    doctorId: doctor.id,
    appointmentId: appointment.id,
    metadata: {
      googleEventId: googleEvent?.id || null
    }
  });

  return {
    synced: true,
    action,
    googleEvent
  };
}

export async function syncCalendarEventToGoogle(eventId, action = 'create') {
  const event = await getDocument(COLLECTIONS.CALENDAR_EVENTS, eventId);
  if (!event) {
    throw createError(404, 'Calendar event not found', 'CALENDAR_EVENT_NOT_FOUND');
  }

  const doctor = await getDoctorById(event.doctorId);
  if (!doctor || !doctor.googleOwnerId || !doctor.googleCalendarId) {
    return { synced: false, reason: 'google_not_configured' };
  }

  const eventPayload = {
    summary: event.title || 'Calendar event',
    description: event.description || '',
    location: event.location || '',
    start: {
      dateTime: event.startTime,
      timeZone: event.timezone || doctor.timezone || 'UTC'
    },
    end: {
      dateTime: event.endTime,
      timeZone: event.timezone || doctor.timezone || 'UTC'
    },
    attendees: event.attendees || []
  };

  let googleEvent = null;
  if (action === 'create') {
    googleEvent = await createGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, eventPayload);
  } else if (action === 'update') {
    if (event.googleEventId) {
      googleEvent = await updateGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, event.googleEventId, eventPayload);
    } else {
      googleEvent = await createGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, eventPayload);
    }
  } else if (action === 'delete' && event.googleEventId) {
    await deleteGoogleCalendarEvent(doctor.googleOwnerId, doctor.googleCalendarId, event.googleEventId);
    googleEvent = { deleted: true };
  }

  await updateDocument(COLLECTIONS.CALENDAR_EVENTS, event.id, {
    ...event,
    googleEventId: googleEvent?.id || event.googleEventId || null,
    googleSyncStatus: action === 'delete' ? 'deleted' : 'synced',
    rawEvent: googleEvent || event.rawEvent || null,
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  await recordSchedulingLog({
    type: `google.calendarEvent.${action}`,
    message: `Manual calendar event ${action}`,
    entityType: 'calendarEvent',
    entityId: event.id,
    doctorId: doctor.id,
    metadata: {
      googleEventId: googleEvent?.id || event.googleEventId || null
    }
  });

  return {
    synced: true,
    action,
    googleEvent
  };
}

export async function listGoogleCalendarEventsForDoctor(doctorId, range = {}) {
  const doctor = await getDoctorById(doctorId);
  if (!doctor || !doctor.googleOwnerId || !doctor.googleCalendarId) {
    return [];
  }

  return listGoogleCalendarEvents(
    doctor.googleOwnerId,
    doctor.googleCalendarId,
    range.timeMin || new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
    range.timeMax || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
  );
}

export async function createWatchChannel(payload, requestContext = {}) {
  ensureFields(payload, ['doctorId', 'webhookUrl'], 'calendar watch');
  const doctor = await getDoctorById(payload.doctorId);
  if (!doctor || !doctor.googleOwnerId || !doctor.googleCalendarId) {
    throw createError(409, 'Doctor is not linked to Google Calendar', 'GOOGLE_NOT_LINKED');
  }

  const channel = await watchGoogleCalendar(doctor.googleOwnerId, doctor.googleCalendarId, payload.webhookUrl, payload.channelToken || payload.token || payload.doctorId);
  const record = await addDocument(COLLECTIONS.CALENDAR_WATCH_CHANNELS, {
    id: uuid(),
    doctorId: doctor.id,
    calendarId: doctor.googleCalendarId,
    channelId: channel.id || channel.resourceId || uuid(),
    resourceId: channel.resourceId || null,
    webhookUrl: payload.webhookUrl,
    token: payload.channelToken || payload.token || payload.doctorId,
    status: 'active',
    expiresAt: channel.expiration || null,
    rawChannel: channel,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs()
  });

  await recordSchedulingLog({
    type: 'calendar.watch.created',
    message: 'Google calendar watch created',
    entityType: 'calendarWatch',
    entityId: record.id,
    doctorId: doctor.id,
    requestId: requestContext.requestId,
    metadata: {
      webhookUrl: payload.webhookUrl
    }
  });

  return record;
}

export async function stopWatchChannel(channelId) {
  const existing = await queryDocuments(COLLECTIONS.CALENDAR_WATCH_CHANNELS, [['channelId', '==', channelId]]);
  if (existing.length === 0) {
    return { stopped: false };
  }

  const record = existing.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0))[0];
  await stopGoogleCalendarWatch(record.doctorId, record.channelId, record.resourceId);
  await updateDocument(COLLECTIONS.CALENDAR_WATCH_CHANNELS, record.id, {
    ...record,
    status: 'stopped',
    updatedAt: nowIso(),
    updatedAtMs: nowMs()
  });

  return { stopped: true };
}

export async function handleGoogleWebhook(headers = {}, body = {}) {
  const channelId = headers['x-goog-channel-id'] || headers['X-Goog-Channel-Id'];
  const resourceId = headers['x-goog-resource-id'] || headers['X-Goog-Resource-Id'];
  const resourceState = headers['x-goog-resource-state'] || headers['X-Goog-Resource-State'];
  const token = headers['x-goog-channel-token'] || headers['X-Goog-Channel-Token'];

  const webhookEvent = await addDocument(COLLECTIONS.WEBHOOK_EVENTS, {
    id: uuid(),
    source: 'google',
    channelId: channelId || null,
    resourceId: resourceId || null,
    resourceState: resourceState || null,
    token: token || null,
    body,
    receivedAt: nowIso(),
    receivedAtMs: nowMs()
  });

  if (token) {
    const channels = await queryDocuments(COLLECTIONS.CALENDAR_WATCH_CHANNELS, [['token', '==', token]]);
    if (channels.length > 0) {
      const channel = channels.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0))[0];
      enqueueJob(QUEUE_NAMES.GOOGLE_SYNC, JOB_TYPES.WEBHOOK_GOOGLE, {
        doctorId: channel.doctorId,
        channelId,
        resourceId,
        resourceState,
        body,
        webhookEventId: webhookEvent.id
      });
    }
  }

  return webhookEvent;
}

export async function processGoogleWebhookNotification(payload = {}) {
  if (!payload.doctorId) {
    return { processed: false, reason: 'missing_doctorId' };
  }

  const synced = await syncDoctorCalendar(payload.doctorId, payload.range || {});
  await recordSchedulingLog({
    type: 'google.webhook.processed',
    message: 'Google webhook processed',
    entityType: 'calendarWatch',
    entityId: payload.webhookEventId || payload.channelId || null,
    doctorId: payload.doctorId,
    metadata: {
      resourceId: payload.resourceId || null,
      resourceState: payload.resourceState || null
    }
  });

  return {
    processed: true,
    syncedCount: synced.length
  };
}

export async function getCalendarEventById(eventId) {
  return getDocument(COLLECTIONS.CALENDAR_EVENTS, eventId);
}

export async function syncDoctorCalendar(doctorId, range = {}) {
  const events = await listGoogleCalendarEventsForDoctor(doctorId, range);
  const localEvents = events.map(convertGoogleEventToLocal);
  cacheCalendarEvents(`doctor:${doctorId}:${JSON.stringify(range)}`, localEvents);
  invalidateByPrefix(`calendar:events:doctor:${doctorId}`);
  return localEvents;
}
