import { asyncHandler } from '../middlewares/request.middleware.js';
import { sendSuccess } from '../utils/response.js';
import { createZoomMeeting, updateZoomMeeting, deleteZoomMeeting, getZoomMeeting } from '../services/zoom.service.js';
import { getAppointmentById } from '../services/appointment.service.js';
import { saveMeetingHistory } from '../services/zoom.service.js';

export const createZoomMeetingController = asyncHandler(async (req, res) => {
  const meeting = await createZoomMeeting(req.body);
  if (req.body.appointmentId) {
    const appointment = await getAppointmentById(req.body.appointmentId);
    if (appointment) {
      await saveMeetingHistory({
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        meetingId: meeting.id,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url,
        topic: meeting.topic,
        status: 'created',
        metadata: meeting
      });
    }
  }
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

