import cache from '../config/cache.js';
import { CACHE_TTLS_SECONDS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

export function buildCacheKey(...parts) {
  return parts.filter(Boolean).join(':');
}

export function getCachedValue(key) {
  return cache.get(key);
}

export function setCachedValue(key, value, ttlSeconds = CACHE_TTLS_SECONDS.appointments) {
  cache.set(key, value, ttlSeconds);
  return value;
}

export function deleteCachedValue(key) {
  cache.del(key);
}

export function invalidateByPrefix(prefix) {
  const keys = cache.keys();
  let removed = 0;
  for (const key of keys) {
    if (key.startsWith(prefix)) {
      cache.del(key);
      removed += 1;
    }
  }
  if (removed > 0) {
    logger.info('Cache invalidated by prefix', { prefix, removed });
  }
  return removed;
}

export function cacheDoctorAvailability(doctorId, dateKey, value) {
  return setCachedValue(buildCacheKey('doctor', doctorId, 'availability', dateKey), value, CACHE_TTLS_SECONDS.doctorAvailability);
}

export function getDoctorAvailabilityCache(doctorId, dateKey) {
  return getCachedValue(buildCacheKey('doctor', doctorId, 'availability', dateKey));
}

export function cacheDoctorRecord(doctorId, value) {
  return setCachedValue(buildCacheKey('doctor', doctorId), value, CACHE_TTLS_SECONDS.doctors);
}

export function getDoctorRecordCache(doctorId) {
  return getCachedValue(buildCacheKey('doctor', doctorId));
}

export function cacheAppointmentRecord(appointmentId, value) {
  return setCachedValue(buildCacheKey('appointment', appointmentId), value, CACHE_TTLS_SECONDS.appointments);
}

export function getAppointmentRecordCache(appointmentId) {
  return getCachedValue(buildCacheKey('appointment', appointmentId));
}

export function cacheCalendarEvents(key, value) {
  return setCachedValue(buildCacheKey('calendar', 'events', key), value, CACHE_TTLS_SECONDS.calendarEvents);
}

export function getCalendarEventsCache(key) {
  return getCachedValue(buildCacheKey('calendar', 'events', key));
}

