import axios from 'axios';
import { zoomConfig, isZoomConfigured } from '../config/zoom.js';
import { COLLECTIONS } from '../utils/constants.js';
import { addDocument, queryDocuments } from './firestore.service.js';
import { createError, nowIso, nowMs, uuid } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';
import { getCachedValue, setCachedValue } from './cache.service.js';
import { CACHE_TTLS_SECONDS } from '../utils/constants.js';
import { recordSchedulingLog } from './log.service.js';

const ZOOM_TOKEN_CACHE_KEY = 'zoom:access-token';

async function getServerToServerToken() {
  if (!isZoomConfigured()) {
    throw createError(503, 'Zoom configuration is missing', 'ZOOM_NOT_CONFIGURED');
  }

  const cached = getCachedValue(ZOOM_TOKEN_CACHE_KEY);
  if (cached && cached.expiryDate > nowMs() + 60000) {
    return cached.accessToken;
  }

  const response = await axios.post(
    'https://zoom.us/oauth/token',
    new URLSearchParams({
      grant_type: 'account_credentials',
      account_id: zoomConfig.accountId
    }).toString(),
    {
      auth: {
        username: zoomConfig.clientId,
        password: zoomConfig.clientSecret
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      timeout: 15000
    }
  );

  const accessToken = response.data.access_token;
  const expiryDate = nowMs() + Number(response.data.expires_in || 3600) * 1000;
  setCachedValue(ZOOM_TOKEN_CACHE_KEY, { accessToken, expiryDate }, CACHE_TTLS_SECONDS.zoomToken);
  return accessToken;
}

async function zoomRequest(method, path, data = null, params = {}) {
  const accessToken = await getServerToServerToken();
  try {
    const response = await axios.request({
      method,
      url: `https://api.zoom.us/v2${path}`,
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
    logger.error('Zoom API request failed', {
      method,
      path,
      error: error?.response?.data || error.message
    });
    throw createError(
      error?.response?.status || 500,
      error?.response?.data?.message || error.message || 'Zoom API request failed',
      'ZOOM_API_ERROR',
      error?.response?.data || null
    );
  }
}

export async function createZoomMeeting(meetingPayload) {
  const response = await zoomRequest('post', '/users/me/meetings', meetingPayload);
  return response;
}

export async function updateZoomMeeting(meetingId, meetingPayload) {
  const response = await zoomRequest('patch', `/meetings/${encodeURIComponent(meetingId)}`, meetingPayload);
  return response;
}

export async function deleteZoomMeeting(meetingId) {
  await zoomRequest('delete', `/meetings/${encodeURIComponent(meetingId)}`);
  return true;
}

export async function getZoomMeeting(meetingId) {
  const response = await zoomRequest('get', `/meetings/${encodeURIComponent(meetingId)}`);
  return response;
}

export async function saveMeetingHistory({
  appointmentId = null,
  doctorId = null,
  meetingId,
  joinUrl = null,
  startUrl = null,
  topic = null,
  status = 'created',
  metadata = {}
}) {
  const payload = {
    id: uuid(),
    appointmentId,
    doctorId,
    meetingId,
    joinUrl,
    startUrl,
    topic,
    status,
    metadata,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    createdAtMs: nowMs(),
    updatedAtMs: nowMs()
  };
  const record = await addDocument(COLLECTIONS.MEETING_HISTORY, payload);
  await recordSchedulingLog({
    type: 'zoom.meeting.history',
    message: 'Zoom meeting history saved',
    entityType: 'meetingHistory',
    entityId: record?.id || payload.id,
    doctorId,
    appointmentId,
    metadata
  });
  return record;
}

export async function getMeetingHistoryByMeetingId(meetingId) {
  if (!meetingId) return null;
  const matches = await queryDocuments(COLLECTIONS.MEETING_HISTORY, [['meetingId', '==', String(meetingId)]]);
  if (matches.length === 0) return null;
  return matches.sort((left, right) => (right.createdAtMs || 0) - (left.createdAtMs || 0))[0];
}

export function getZoomStatus() {
  return {
    configured: isZoomConfigured(),
    hasAccountId: Boolean(zoomConfig.accountId),
    hasClientId: Boolean(zoomConfig.clientId),
    hasClientSecret: Boolean(zoomConfig.clientSecret)
  };
}