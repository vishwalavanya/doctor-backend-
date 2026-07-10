import { nowIso } from './helpers.js';

export function sendSuccess(res, data = null, message = 'Success', statusCode = 200, meta = {}) {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
    meta: {
      timestamp: nowIso(),
      ...meta
    }
  });
}

export function sendError(res, message = 'Request failed', statusCode = 500, details = null, meta = {}) {
  return res.status(statusCode).json({
    success: false,
    message,
    error: details,
    meta: {
      timestamp: nowIso(),
      ...meta
    }
  });
}

