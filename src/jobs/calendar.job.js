import { syncAppointmentToGoogle, syncDoctorCalendar, syncCalendarEventToGoogle, processGoogleWebhookNotification } from '../services/calendar.service.js';
import { logger } from '../utils/logger.js';

export async function processCalendarJob(job) {
  const payload = job.payload || {};

  switch (job.type) {
    case 'calendar.sync': {
      if (payload.action === 'create' || payload.action === 'update' || payload.action === 'delete') {
        await syncAppointmentToGoogle({
          appointmentId: payload.appointmentId,
          action: payload.action
        });
      } else if (payload.doctorId) {
        await syncDoctorCalendar(payload.doctorId, payload.range || {});
      }
      break;
    }
    case 'calendar.event.create': {
      await syncCalendarEventToGoogle(payload.eventId || payload.event?.id, 'create');
      break;
    }
    case 'calendar.event.update': {
      await syncCalendarEventToGoogle(payload.eventId || payload.event?.id, 'update');
      break;
    }
    case 'calendar.event.delete': {
      await syncCalendarEventToGoogle(payload.eventId || payload.event?.id, 'delete');
      break;
    }
    case 'webhook.google': {
      await processGoogleWebhookNotification(payload);
      break;
    }
    default: {
      logger.warn('Unknown calendar job type', { jobType: job.type, payload });
    }
  }
}
