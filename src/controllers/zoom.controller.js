import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { createError } from '../utils/helpers.js';
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomMeeting } from '../services/zoom.service.js';
import { getAppointmentById } from '../services/appointment.service.js';
import { saveMeetingHistory } from '../services/zoom.service.js';

export const createZoomMeetingController = asyncHandler(async (req, res) => {
  let appointment = null;

  if (req.body.appointmentId) {
    appointment = await getAppointmentById(req.body.appointmentId);
    if (!appointment) {
      throw createError(404, 'Appointment not found', 'APPOINTMENT_NOT_FOUND');
    }
    // A doctor may only attach a Zoom meeting to their own appointment.
    if (appointment.doctorId && req.userId && appointment.doctorId !== req.userId) {
      throw createError(403, 'You can only create meetings for your own appointments', 'FORBIDDEN');
    }
  }

  const meeting = await createZoomMeeting(req.body);

  await saveMeetingHistory({
    appointmentId: appointment?.id || null,
    doctorId: appointment?.doctorId || req.userId || null,
    meetingId: meeting.id,
    joinUrl: meeting.join_url,
    startUrl: meeting.start_url,
    topic: meeting.topic,
    status: 'created',
    metadata: meeting
  });

  return sendSuccess(res, meeting, 'Zoom meeting created', 201, { requestId: req.requestId });
});

export const updateZoomMeetingController = asyncHandler(async (req, res) => {
  const meeting = await updateZoomMeeting(req.params.meetingId, req.body);
  return sendSuccess(res, meeting, 'Zoom meeting updated', 200, { requestId: req.requestId });
});

export const deleteZoomMeetingController = asyncHandler(async (req, res) => {
  const result = await deleteZoomMeeting(req.params.meetingId);
  return sendSuccess(res, result, 'Zoom meeting deleted', 200, { requestId: req.requestId });
});

export const getZoomMeetingController = asyncHandler(async (req, res) => {
  const meeting = await getZoomMeeting(req.params.meetingId);
  return sendSuccess(res, meeting, 'Zoom meeting fetched', 200, { requestId: req.requestId });
});