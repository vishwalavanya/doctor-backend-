// src/utils/jwt.js
import jwt from 'jsonwebtoken';
import { createError } from './helpers.js';

const DEFAULT_EXPIRES_IN = '7d';

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw createError(
      500,
      'JWT_SECRET is not configured on the server',
      'JWT_SECRET_MISSING'
    );
  }
  return secret;
}

/**
 * Generate a signed JWT for an authenticated doctor.
 * @param {object} payload - Data to embed in the token (e.g. { id, email }).
 * @param {object} options - Optional overrides, e.g. { expiresIn: '1d' }.
 * @returns {string} signed JWT
 */
export function generateToken(payload, options = {}) {
  const secret = getJwtSecret();
  return jwt.sign(payload, secret, {
    expiresIn: options.expiresIn || process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN
  });
}

/**
 * Verify a JWT and return its decoded payload.
 * Throws an AppError (401) if the token is missing, malformed, or expired.
 * @param {string} token
 * @returns {object} decoded payload
 */
export function verifyToken(token) {
  const secret = getJwtSecret();
  try {
    return jwt.verify(token, secret);
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      throw createError(401, 'Session expired, please log in again', 'TOKEN_EXPIRED');
    }
    throw createError(401, 'Invalid or malformed token', 'TOKEN_INVALID');
  }
}

/**
 * Extracts a bearer token from an Express Authorization header value.
 * @param {string} headerValue - e.g. "Bearer eyJhbGciOi..."
 * @returns {string|null}
 */
export function extractBearerToken(headerValue) {
  if (!headerValue || typeof headerValue !== 'string') {
    return null;
  }
  const [scheme, token] = headerValue.split(' ');
  if (!scheme || scheme.toLowerCase() !== 'bearer' || !token) {
    return null;
  }
  return token.trim();
}