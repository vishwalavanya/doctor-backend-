// src/middlewares/auth.middleware.js
import { extractBearerToken, verifyToken } from '../utils/jwt.js';
import { createError } from '../utils/helpers.js';
import { asyncHandler } from './request.middleware.js';

/**
 * Verifies the Authorization: Bearer <token> header, decodes the JWT,
 * and attaches the authenticated doctor to the request as:
 *   req.user   - the decoded token payload ({ id, email, iat, exp })
 *   req.userId - shorthand for req.user.id (the doctor's id)
 *
 * Throws 401 if the header is missing or the token is invalid/expired.
 */
export function authenticate(req, res, next) {
  const token = extractBearerToken(req.headers.authorization);
  if (!token) {
    return next(createError(401, 'Authentication token is required', 'UNAUTHENTICATED'));
  }

  try {
    const decoded = verifyToken(token);
    if (!decoded?.id) {
      return next(createError(401, 'Invalid authentication token', 'TOKEN_INVALID'));
    }
    req.user = decoded;
    req.userId = decoded.id;
    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Forces `doctorId` on the request body and/or query string to always be
 * the authenticated doctor's own id. This prevents a logged-in doctor from
 * creating or listing another doctor's appointments/calendar events/etc.
 * by passing a different doctorId in the payload.
 *
 * Use on routes where the resource is scoped by a doctorId field in the
 * body (create) or query string (list), e.g. POST /appointments,
 * GET /appointments, POST /calendar/events.
 */
export function attachDoctorScope(req, res, next) {
  if (!req.userId) {
    return next(createError(401, 'Not authenticated', 'UNAUTHENTICATED'));
  }

  if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) {
    req.body.doctorId = req.userId;
  }

  if (req.query && typeof req.query === 'object') {
    req.query.doctorId = req.userId;
  }

  next();
}

/**
 * Ensures a route param (default: :doctorId) matches the authenticated
 * doctor's own id. Use on routes like /doctors/:doctorId, /doctors/:doctorId/leave-days.
 */
export function requireOwnDoctorParam(paramName = 'doctorId') {
  return function (req, res, next) {
    const targetId = req.params[paramName];
    if (!req.userId) {
      return next(createError(401, 'Not authenticated', 'UNAUTHENTICATED'));
    }
    if (targetId && targetId !== req.userId) {
      return next(createError(403, 'You can only access your own resources', 'FORBIDDEN'));
    }
    next();
  };
}

/**
 * Middleware factory for ownership checks on entities that are not keyed
 * by doctorId in the URL directly (e.g. appointments/:appointmentId,
 * calendar/events/:eventId, zoom/meetings/:meetingId). Fetches the
 * resource via `fetchResource(idFromParam)` and compares its `doctorField`
 * against the authenticated doctor. The fetched resource is attached to
 * `req.resource` so downstream controllers can reuse it if needed.
 */
export function requireOwnResource(fetchResource, { paramName = 'id', doctorField = 'doctorId', allowMissing = false } = {}) {
  return asyncHandler(async (req, res, next) => {
    if (!req.userId) {
      return next(createError(401, 'Not authenticated', 'UNAUTHENTICATED'));
    }

    const resourceId = req.params[paramName];
    const resource = await fetchResource(resourceId);

    if (!resource) {
      if (allowMissing) {
        return next();
      }
      return next(createError(404, 'Resource not found', 'NOT_FOUND'));
    }

    if (resource[doctorField] && resource[doctorField] !== req.userId) {
      return next(createError(403, 'You can only access your own resources', 'FORBIDDEN'));
    }

    req.resource = resource;
    next();
  });
}