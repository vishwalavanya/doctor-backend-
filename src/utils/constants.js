export const COLLECTIONS = {
  USERS: 'users',
  DOCTORS: 'doctors',
  APPOINTMENTS: 'appointments',
  MEETING_HISTORY: 'meetingHistory',
  CALENDAR_EVENTS: 'calendarEvents',
  NOTIFICATIONS: 'notifications',
  SCHEDULING_LOGS: 'schedulingLogs',
  GOOGLE_TOKENS: 'googleTokens',
  ZOOM_TOKENS: 'zoomTokens',
  WEBHOOK_EVENTS: 'webhookEvents',
  CALENDAR_WATCH_CHANNELS: 'calendarWatchChannels'
};

export const APPOINTMENT_STATUS = {
  SCHEDULED: 'scheduled',
  CANCELLED: 'cancelled',
  RESCHEDULED: 'rescheduled',
  COMPLETED: 'completed',
  PENDING: 'pending'
};

export const DOCTOR_STATUS = {
  ACTIVE: 'active',
  INACTIVE: 'inactive'
};

export const QUEUE_NAMES = {
  GOOGLE_SYNC: 'google-sync',
  ZOOM_SYNC: 'zoom-sync',
  NOTIFICATIONS: 'notifications',
  RETRY: 'retry'
};

export const JOB_TYPES = {
  CALENDAR_SYNC: 'calendar.sync',
  CALENDAR_EVENT_CREATE: 'calendar.event.create',
  CALENDAR_EVENT_UPDATE: 'calendar.event.update',
  CALENDAR_EVENT_DELETE: 'calendar.event.delete',
  ZOOM_MEETING_CREATE: 'zoom.meeting.create',
  ZOOM_MEETING_UPDATE: 'zoom.meeting.update',
  ZOOM_MEETING_DELETE: 'zoom.meeting.delete',
  NOTIFICATION_SEND: 'notification.send',
  RETRY_PROCESS: 'retry.process',
  WEBHOOK_GOOGLE: 'webhook.google',
  WEBHOOK_ZOOM: 'webhook.zoom'
};

export const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
export const MAX_RETRY_ATTEMPTS = 5;

export const CACHE_KEYS = {
  DOCTOR_AVAILABILITY: 'doctor:availability',
  DOCTOR: 'doctor',
  APPOINTMENT: 'appointment',
  APPOINTMENTS: 'appointments',
  CALENDAR_EVENTS: 'calendar:events'
};

export const CACHE_TTLS_SECONDS = {
  doctorAvailability: 60,
  doctors: 300,
  appointments: 30,
  calendarEvents: 60,
  googleToken: 300,
  zoomToken: 2700
};

export const DEFAULT_TIMEZONE = 'UTC';

export const DEFAULT_WORKING_HOURS = [
  { dayOfWeek: 1, start: '09:00', end: '17:00', enabled: true },
  { dayOfWeek: 2, start: '09:00', end: '17:00', enabled: true },
  { dayOfWeek: 3, start: '09:00', end: '17:00', enabled: true },
  { dayOfWeek: 4, start: '09:00', end: '17:00', enabled: true },
  { dayOfWeek: 5, start: '09:00', end: '17:00', enabled: true }
];

export const DEFAULT_SLOT_MINUTES = 30;

