// src/services/google.service.js
import axios from 'axios';
import { OAuth2Client } from 'google-auth-library';
import { googleConfig, isGoogleConfigured } from '../config/google.js';
import { COLLECTIONS } from '../utils/constants.js';
import { addDocument, getDocument, queryDocuments, setDocument, updateDocument } from './firestore.service.js';
import { createError, dateOnly, overlaps, nowIso, nowMs, uuid } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { CACHE_TTLS_SECONDS } from '../utils/constants.js';
import { getCachedValue, setCachedValue } from './cache.service.js';
import { recordSchedulingLog } from './log.service.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE_URL = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_AUTH_SCOPES = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/userinfo.email'
];

function getTokenCacheKey(ownerId) {
  return `google:tokens:${ownerId}`;
}

function normalizeTokenRecord(record = {}) {
  return {
    accessToken: record.accessToken || record.access_token || null,
    refreshToken: record.refreshToken || record.refresh_token || null,
    expiryDate: record.expiryDate || record.expiry_date || null,
    scope: record.scope || null,
    tokenType: record.tokenType || record.token_type || 'Bearer',
    calendarId: record.calendarId || record.calendar_id || 'primary',
    userEmail: record.userEmail || record.user_email || null
  };
}

async function requestGoogleToken(formData) {
  const response = await axios.post(GOOGLE_TOKEN_URL, new URLSearchParams(formData).toString(), {
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    timeout: 15000
  });
  return response.data;
}

async function saveTokens(ownerId, tokenData) {
  const normalized = normalizeTokenRecord(tokenData);
  const expiryDate = normalized.expiryDate || tokenData.expiryDate || (tokenData.expires_in ? nowMs() + Number(tokenData.expires_in) * 1000 : null);
  const payload = {
    id: uuid(),
    ownerId,
    ...normalized,
    expiryDate,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs()
  };

  const record = await setDocument(COLLECTIONS.GOOGLE_TOKENS, ownerId, payload, true);
  setCachedValue(getTokenCacheKey(ownerId), record, CACHE_TTLS_SECONDS.googleToken);
  return record;
}


export function generateGoogleAuthUrl({ redirectUri, ownerId } = {}) {
  if (!isGoogleConfigured()) {
    throw createError(
      503,
      'Google configuration is missing',
      'GOOGLE_NOT_CONFIGURED'
    );
  }

  if (!ownerId) {
    throw createError(
      400,
      'ownerId is required',
      'VALIDATION_ERROR'
    );
  }

const resolvedRedirectUri =
  redirectUri || process.env.GOOGLE_REDIRECT_URI;

  if (!resolvedRedirectUri) {
    throw createError(
      400,
      'redirectUri is required',
      'VALIDATION_ERROR'
    );
  }

 const oauth2Client = new OAuth2Client(
    googleConfig.clientId,
    googleConfig.clientSecret,
    resolvedRedirectUri
  );

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: GOOGLE_AUTH_SCOPES,
    state: ownerId
  });
}


export async function exchangeGoogleAuthCode({ ownerId, code, redirectUri }) {
  if (!isGoogleConfigured()) {
    throw createError(503, 'Google configuration is missing', 'GOOGLE_NOT_CONFIGURED');
  }
  if (!ownerId || !code || !redirectUri) {
    throw createError(400, 'ownerId, code, and redirectUri are required', 'VALIDATION_ERROR');
  }

  const tokenData = await requestGoogleToken({
    code,
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const record = await saveTokens(ownerId, tokenData);
  await recordSchedulingLog({
    type: 'google.linked',
    message: 'Google account linked',
    entityType: 'googleTokens',
    entityId: ownerId,
    metadata: {
      scope: record.scope,
      userEmail: record.userEmail
    }
  });

  return record;
}

export async function refreshGoogleAccessToken(ownerId) {
  const tokenRecord = await getGoogleTokens(ownerId);
  if (!tokenRecord?.refreshToken) {
    throw createError(401, 'Google refresh token not available', 'GOOGLE_TOKEN_MISSING');
  }

  const tokenData = await requestGoogleToken({
    refresh_token: tokenRecord.refreshToken,
    client_id: googleConfig.clientId,
    client_secret: googleConfig.clientSecret,
    grant_type: 'refresh_token'
  });

  const updated = await saveTokens(ownerId, {
    ...tokenRecord,
    accessToken: tokenData.access_token,
    expiryDate: nowMs() + Number(tokenData.expires_in || 3600) * 1000,
    scope: tokenData.scope || tokenRecord.scope,
    tokenType: tokenData.token_type || tokenRecord.tokenType
  });

  return updated;
}

export async function getGoogleTokens(ownerId) {
  if (!ownerId) return null;
  const cached = getCachedValue(getTokenCacheKey(ownerId));
  if (cached) {
    return cached;
  }

  const record = await getDocument(COLLECTIONS.GOOGLE_TOKENS, ownerId);
  if (!record) {
    return null;
  }

  const normalized = {
    ...record,
    ...normalizeTokenRecord(record)
  };
  setCachedValue(getTokenCacheKey(ownerId), normalized, CACHE_TTLS_SECONDS.googleToken);
  return normalized;
}

export async function getGoogleAccessToken(ownerId) {
  const tokenRecord = await getGoogleTokens(ownerId);
  if (!tokenRecord) {
    throw createError(404, 'Google tokens not found for this owner', 'GOOGLE_TOKEN_NOT_FOUND');
  }

  const expiryDate = Number(tokenRecord.expiryDate || 0);
  if (tokenRecord.accessToken && expiryDate && expiryDate > nowMs() + 60000) {
    return tokenRecord.accessToken;
  }

  if (tokenRecord.refreshToken) {
    const refreshed = await refreshGoogleAccessToken(ownerId);
    return refreshed.accessToken;
  }

  if (tokenRecord.accessToken) {
    return tokenRecord.accessToken;
  }

  throw createError(401, 'Google access token unavailable', 'GOOGLE_TOKEN_MISSING');
}

function normalizeEventRange(event) {
  const start = event?.start?.dateTime || event?.start?.date || null;
  const end = event?.end?.dateTime || event?.end?.date || null;
  if (!start || !end) {
    return null;
  }

  const startValue = event?.start?.date ? new Date(`${event.start.date}T00:00:00.000Z`).toISOString() : new Date(start).toISOString();
  const endValue = event?.end?.date ? new Date(`${event.end.date}T23:59:59.999Z`).toISOString() : new Date(end).toISOString();
  return {
    start: startValue,
    end: endValue
  };
}

async function googleRequest(ownerId, method, path, data = null, params = {}) {
  const accessToken = await getGoogleAccessToken(ownerId);
  try {
    const response = await axios.request({
      method,
      url: `${GOOGLE_CALENDAR_BASE_URL}${path}`,
      data,
      params,
      timeout: 20000,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      }
    });
    return response.data;
  } catch (error) {
    logger.error('Google API request failed', {
      ownerId,
      method,
      path,
      error: error?.response?.data || error.message
    });
    throw createError(
      error?.response?.status || 500,
      error?.response?.data?.error?.message || error.message || 'Google API request failed',
      'GOOGLE_API_ERROR',
      error?.response?.data || null
    );
  }
}

export async function createGoogleCalendarEvent(ownerId, calendarId, eventPayload) {
  const event = await googleRequest(ownerId, 'post', `/calendars/${encodeURIComponent(calendarId || 'primary')}/events`, eventPayload);
  return event;
}

export async function updateGoogleCalendarEvent(ownerId, calendarId, eventId, eventPayload) {
  const event = await googleRequest(ownerId, 'put', `/calendars/${encodeURIComponent(calendarId || 'primary')}/events/${encodeURIComponent(eventId)}`, eventPayload);
  return event;
}

export async function deleteGoogleCalendarEvent(ownerId, calendarId, eventId) {
  await googleRequest(ownerId, 'delete', `/calendars/${encodeURIComponent(calendarId || 'primary')}/events/${encodeURIComponent(eventId)}`);
  return true;
}

export async function listGoogleCalendarEvents(ownerId, calendarId, timeMin, timeMax) {
  const events = await googleRequest(ownerId, 'get', `/calendars/${encodeURIComponent(calendarId || 'primary')}/events`, null, {
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return events.items || [];
}

export async function watchGoogleCalendar(ownerId, calendarId, webhookUrl, channelToken) {
  const channel = {
    id: uuid(),
    type: 'web_hook',
    address: webhookUrl,
    token: channelToken || ownerId,
    params: {
      ttl: '604800'
    }
  };
  const response = await googleRequest(ownerId, 'post', `/calendars/${encodeURIComponent(calendarId || 'primary')}/events/watch`, channel);
  return response;
}

export async function stopGoogleCalendarWatch(ownerId, channelId, resourceId) {
  const response = await googleRequest(ownerId, 'post', '/channels/stop', {
    id: channelId,
    resourceId
  });
  return response;
}

export async function detectGoogleConflicts({ ownerId, calendarId = 'primary', startTime, endTime }) {
  const events = await listGoogleCalendarEvents(ownerId, calendarId, startTime, endTime);
  const conflicts = [];
  for (const event of events) {
    const range = normalizeEventRange(event);
    if (!range) continue;
    if (overlaps(range, { start: startTime, end: endTime })) {
      conflicts.push(event);
    }
  }
  return conflicts;
}

export async function listGoogleCalendars(ownerId) {
  const data = await googleRequest(ownerId, 'get', '/users/me/calendarList');
  return data.items || [];
}

export function getGoogleStatus() {
  return {
    configured: isGoogleConfigured(),
    hasClientId: Boolean(googleConfig.clientId),
    hasClientSecret: Boolean(googleConfig.clientSecret),
    hasApiKey: Boolean(googleConfig.apiKey)
  };
}

export function convertGoogleEventToLocal(event) {
  const range = normalizeEventRange(event);
  return {
    googleEventId: event.id,
    summary: event.summary || '',
    description: event.description || '',
    startTime: range?.start || event?.start?.dateTime || event?.start?.date || null,
    endTime: range?.end || event?.end?.dateTime || event?.end?.date || null,
    htmlLink: event.htmlLink || null,
    status: event.status || 'confirmed',
    attendees: event.attendees || [],
    rawEvent: event
  };
}