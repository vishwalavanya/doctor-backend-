import { RETRY_DELAYS_MS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { nowIso } from '../utils/helpers.js';

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeWithRetry(operation, options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : RETRY_DELAYS_MS.length;
  const delays = Array.isArray(options.delays) && options.delays.length > 0 ? options.delays : RETRY_DELAYS_MS;
  const shouldRetry = typeof options.shouldRetry === 'function' ? options.shouldRetry : () => true;
  const onRetry = typeof options.onRetry === 'function' ? options.onRetry : null;

  let attempt = 0;
  let lastError = null;

  while (attempt <= retries) {
    try {
      return await operation({ attempt, lastError });
    } catch (error) {
      lastError = error;
      const retryable = shouldRetry(error);
      if (!retryable || attempt >= retries) {
        throw error;
      }

      const delayMs = delays[Math.min(attempt, delays.length - 1)] || delays[delays.length - 1];
      logger.warn('Retrying external operation', {
        attempt: attempt + 1,
        delayMs,
        error: error?.message,
        timestamp: nowIso()
      });

      if (onRetry) {
        onRetry({
          attempt: attempt + 1,
          delayMs,
          error
        });
      }

      await wait(delayMs);
      attempt += 1;
    }
  }

  throw lastError;
}

