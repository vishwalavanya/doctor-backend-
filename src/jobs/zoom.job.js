import { createZoomMeeting, deleteZoomMeeting, saveMeetingHistory, updateZoomMeeting } from '../services/zoom.service.js';
import { getAppointmentById, updateAppointmentMetadata } from '../services/appointment.service.js';
import { logger } from '../utils/logger.js';

function buildMeetingPayload(appointment) {
  return {
    topic: appointment.title || `Appointment with ${appointment.patientName}`,
    type: 2,
    start_time: appointment.startTime,
    duration: Math.max(15, Math.round((new Date(appointment.endTime).getTime() - new Date(appointment.startTime).getTime()) / 60000)),
    timezone: appointment.timezone || 'UTC',
    agenda: appointment.notes || `Consultation for ${appointment.patientName}`,
    settings: {
      waiting_room: true,
      join_before_host: false,
      mute_upon_entry: true,
      approval_type: 0,
      auto_recording: 'none'
    }
  };
}

export async function processZoomJob(job) {
  const payload = job.payload || {};

  switch (job.type) {
    case 'zoom.meeting.create': {
      const appointment = await getAppointmentById(payload.appointmentId);
      if (!appointment) {
        return;
      }
      const meeting = await createZoomMeeting(buildMeetingPayload(appointment));
      await updateAppointmentMetadata(appointment.id, {
        zoomMeetingId: meeting.id,
        joinUrl: meeting.join_url,
        startUrl: meeting.start_url
      });
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
      break;
    }
    case 'zoom.meeting.update': {
      const appointment = await getAppointmentById(payload.appointmentId);
      if (!appointment || !appointment.zoomMeetingId) {
        return;
      }
      const meeting = await updateZoomMeeting(appointment.zoomMeetingId, buildMeetingPayload(appointment));
      await saveMeetingHistory({
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        meetingId: meeting.id || appointment.zoomMeetingId,
        joinUrl: meeting.join_url || appointment.joinUrl,
        startUrl: meeting.start_url || appointment.startUrl,
        topic: meeting.topic,
        status: 'updated',
        metadata: meeting
      });
      break;
    }
    case 'zoom.meeting.delete': {
      const appointment = await getAppointmentById(payload.appointmentId);
      if (!appointment || !appointment.zoomMeetingId) {
        return;
      }
      await deleteZoomMeeting(appointment.zoomMeetingId);
      await updateAppointmentMetadata(appointment.id, {
        zoomMeetingId: null,
        joinUrl: null,
        startUrl: null
      });
      await saveMeetingHistory({
        appointmentId: appointment.id,
        doctorId: appointment.doctorId,
        meetingId: appointment.zoomMeetingId,
        status: 'deleted',
        metadata: { deleted: true }
      });
      break;
    }
    default: {
      logger.warn('Unknown zoom job type', { jobType: job.type, payload });
    }
  }
}

