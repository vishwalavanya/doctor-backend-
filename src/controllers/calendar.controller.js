// src/controllers/calendar.controller.js
import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import {
  connectGoogleAccount,
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  listCalendarEvents,
  syncDoctorCalendar,
  createWatchChannel,
  stopWatchChannel,
  getCalendarEventById
} from '../services/calendar.service.js';
import { generateGoogleAuthUrl, listGoogleCalendars } from '../services/google.service.js';

export const generateGoogleAuthUrlController = asyncHandler(async (req, res) => {
const authUrl = generateGoogleAuthUrl({
  redirectUri: req.query.redirectUri || req.body?.redirectUri,
  ownerId: req.query.ownerId || req.body?.ownerId
});

  return res.status(200).json({
    success: true,
    authUrl
  });
});

export const connectGoogleController = asyncHandler(async (req, res) => {
  const record = await connectGoogleAccount(req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, record, 'Google account connected', 201, { requestId: req.requestId });
});

export const createCalendarEventController = asyncHandler(async (req, res) => {
  const event = await createCalendarEvent(req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, event, 'Calendar event created', 201, { requestId: req.requestId });
});

export const updateCalendarEventController = asyncHandler(async (req, res) => {
  const event = await updateCalendarEvent(req.params.eventId, req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, event, 'Calendar event updated', 200, { requestId: req.requestId });
});

export const deleteCalendarEventController = asyncHandler(async (req, res) => {
  const result = await deleteCalendarEvent(req.params.eventId, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, result, 'Calendar event deleted', 200, { requestId: req.requestId });
});

export const listCalendarEventsController = asyncHandler(async (req, res) => {
  const events = await listCalendarEvents({
    doctorId: req.query.doctorId,
    appointmentId: req.query.appointmentId,
    from: req.query.from,
    to: req.query.to
  });
  return sendSuccess(res, events, 'Calendar events fetched', 200, { requestId: req.requestId });
});

export const listGoogleCalendarsController = asyncHandler(async (req, res) => {
  const calendars = await listGoogleCalendars(req.query.ownerId || req.body.ownerId);
  return sendSuccess(res, calendars, 'Google calendars fetched', 200, { requestId: req.requestId });
});

export const syncDoctorCalendarController = asyncHandler(async (req, res) => {
  const synced = await syncDoctorCalendar(req.body.doctorId, req.body.range || {});
  return sendSuccess(res, synced, 'Doctor calendar synced', 200, { requestId: req.requestId });
});

export const createWatchChannelController = asyncHandler(async (req, res) => {
  const channel = await createWatchChannel(req.body, { requestId: req.requestId, userId: req.userId });
  return sendSuccess(res, channel, 'Watch channel created', 201, { requestId: req.requestId });
});

export const stopWatchChannelController = asyncHandler(async (req, res) => {
  const result = await stopWatchChannel(req.body.channelId || req.query.channelId);
  return sendSuccess(res, result, 'Watch channel stopped', 200, { requestId: req.requestId });
});

export const getCalendarEventController = asyncHandler(async (req, res) => {
  const event = await getCalendarEventById(req.params.eventId);
  if (!event) {
    return sendSuccess(res, null, 'Calendar event not found', 404, { requestId: req.requestId });
  }
  return sendSuccess(res, event, 'Calendar event fetched', 200, { requestId: req.requestId });
});