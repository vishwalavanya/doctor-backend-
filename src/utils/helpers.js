import { v4 as uuidv4 } from 'uuid';
import { DEFAULT_SLOT_MINUTES } from './constants.js';

export class AppError extends Error {
  constructor(statusCode, message, code = 'APP_ERROR', details = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function createError(statusCode, message, code = 'APP_ERROR', details = null) {
  return new AppError(statusCode, message, code, details);
}

export function isAppError(error) {
  return Boolean(error && error.name === 'AppError');
}

export function nowIso() {
  return new Date().toISOString();
}

export function nowMs() {
  return Date.now();
}

export function uuid() {
  return uuidv4();
}

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

export function ensureFields(payload, fields, entityName = 'payload') {
  const missing = fields.filter((field) => !isNonEmptyString(payload?.[field]) && payload?.[field] !== 0 && payload?.[field] !== false);
  if (missing.length > 0) {
    throw createError(400, `${entityName} is missing required fields`, 'VALIDATION_ERROR', { missing });
  }
}

export function safeNumber(value, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function parsePositiveInt(value, fallback = 1, min = 1, max = 100) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return clamp(parsed, min, max);
}

export function parseBool(value, fallback = false) {
  if (value === true || value === 'true' || value === 1 || value === '1') return true;
  if (value === false || value === 'false' || value === 0 || value === '0') return false;
  return fallback;
}

export function parseJson(value, fallback = null) {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeIsoDateTime(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function dateOnly(value, timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(date);
}

export function timeOnly(value, timeZone = 'UTC') {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  return formatter.format(date);
}

export function toMinutes(value) {
  const [hour, minute] = String(value).split(':').map((part) => Number.parseInt(part, 10));
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function fromMinutes(minutes) {
  const normalized = ((minutes % 1440) + 1440) % 1440;
  const hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function startOfDayIso(dateInput, timeZone = 'UTC') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getZonedParts(date, timeZone);
  return zonedDateTimeToUtcIso(parts.year, parts.month, parts.day, '00:00', timeZone);
}

export function endOfDayIso(dateInput, timeZone = 'UTC') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const parts = getZonedParts(date, timeZone);
  return zonedDateTimeToUtcIso(parts.year, parts.month, parts.day, '23:59', timeZone);
}

export function getDayOfWeek(dateInput, timeZone = 'UTC') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const weekday = formatter.format(date);
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

export function getZonedParts(dateInput, timeZone = 'UTC') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return null;
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== 'literal') {
      map[part.type] = part.value;
    }
  }
  return {
    year: Number.parseInt(map.year, 10),
    month: Number.parseInt(map.month, 10),
    day: Number.parseInt(map.day, 10),
    hour: Number.parseInt(map.hour, 10),
    minute: Number.parseInt(map.minute, 10),
    second: Number.parseInt(map.second, 10)
  };
}

export function zonedDateTimeToUtcIso(year, month, day, timeValue, timeZone = 'UTC') {
  const [hourPart, minutePart] = String(timeValue).split(':');
  const hour = Number.parseInt(hourPart, 10);
  const minute = Number.parseInt(minutePart, 10);
  const naiveUtc = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const offset = getTimeZoneOffsetMs(naiveUtc, timeZone);
  return new Date(naiveUtc.getTime() - offset).toISOString();
}

export function utcIsoToZonedParts(isoValue, timeZone = 'UTC') {
  const date = isoValue instanceof Date ? isoValue : new Date(isoValue);
  return getZonedParts(date, timeZone);
}

export function getTimeZoneOffsetMs(dateInput, timeZone = 'UTC') {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
  if (Number.isNaN(date.getTime())) return 0;
  const zoned = getZonedParts(date, timeZone);
  if (!zoned) return 0;
  const asUtc = Date.UTC(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute, zoned.second);
  return asUtc - date.getTime();
}

export function overlaps(rangeA, rangeB) {
  const startA = new Date(rangeA.start).getTime();
  const endA = new Date(rangeA.end).getTime();
  const startB = new Date(rangeB.start).getTime();
  const endB = new Date(rangeB.end).getTime();
  if ([startA, endA, startB, endB].some((value) => Number.isNaN(value))) {
    return false;
  }
  return startA < endB && endA > startB;
}

export function isSameDay(isoA, isoB, timeZone = 'UTC') {
  return dateOnly(isoA, timeZone) === dateOnly(isoB, timeZone);
}

export function uniqueById(records) {
  const seen = new Set();
  return records.filter((record) => {
    if (seen.has(record.id)) return false;
    seen.add(record.id);
    return true;
  });
}

export function normalizeWorkingHours(hours, fallbackHours = []) {
  const source = Array.isArray(hours) && hours.length > 0 ? hours : fallbackHours;
  return source
    .map((entry) => ({
      dayOfWeek: Number(entry.dayOfWeek),
      start: entry.start || '09:00',
      end: entry.end || '17:00',
      enabled: entry.enabled !== false
    }))
    .filter((entry) => Number.isInteger(entry.dayOfWeek));
}

export function buildTimeSlots({ date, timeZone = 'UTC', startTime, endTime, slotMinutes = DEFAULT_SLOT_MINUTES }) {
  const startIso = zonedDateTimeToUtcIso(date.year, date.month, date.day, startTime, timeZone);
  const endIso = zonedDateTimeToUtcIso(date.year, date.month, date.day, endTime, timeZone);
  const slots = [];
  const slotLengthMs = slotMinutes * 60 * 1000;
  let cursor = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  while (cursor + slotLengthMs <= end) {
    const slotStart = new Date(cursor);
    const slotEnd = new Date(cursor + slotLengthMs);
    slots.push({
      startTime: slotStart.toISOString(),
      endTime: slotEnd.toISOString()
    });
    cursor += slotLengthMs;
  }
  return slots;
}

export function slotConflicts(slot, appointments = []) {
  return appointments.some((appointment) => overlaps(slot, appointment));
}

export function buildSuccessMeta(meta = {}) {
  return {
    timestamp: nowIso(),
    requestId: meta.requestId || uuid(),
    ...meta
  };
}

export function collectionData(snapshot) {
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...doc.data()
  }));
}

export function docData(snapshot) {
  if (!snapshot.exists()) return null;
  return {
    id: snapshot.id,
    ...snapshot.data()
  };
}

export function withDefaultWorkingHours(workingHours) {
  return normalizeWorkingHours(workingHours, [
    { dayOfWeek: 1, start: '09:00', end: '17:00', enabled: true },
    { dayOfWeek: 2, start: '09:00', end: '17:00', enabled: true },
    { dayOfWeek: 3, start: '09:00', end: '17:00', enabled: true },
    { dayOfWeek: 4, start: '09:00', end: '17:00', enabled: true },
    { dayOfWeek: 5, start: '09:00', end: '17:00', enabled: true }
  ]);
}

