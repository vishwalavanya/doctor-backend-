import { isAppError } from '../utils/helpers.js';
import { logger } from '../utils/logger.js';

export function notFoundMiddleware(req, res) {
  res.status(404).json({
    success: false,
    message: 'Route not found',
    error: {
      code: 'NOT_FOUND'
    },
    meta: {
      requestId: req.requestId,
      timestamp: new Date().toISOString()
    }
  });
}

export function errorMiddleware(err, req, res, next) {
  if (res.headersSent) {
    next(err);
    return;
  }

  const statusCode = err.statusCode || 500;
  const code = err.code || (statusCode >= 500 ? 'INTERNAL_SERVER_ERROR' : 'REQUEST_ERROR');
  const message = err.message || 'Unexpected error';

  logger.error('Unhandled error', {
    requestId: req?.requestId,
    statusCode,
    code,
    error: err
  });

  const response = {
    success: false,
    message,
    error: {
      code
    },
    meta: {
      requestId: req?.requestId,
      timestamp: new Date().toISOString()
    }
  };

  if (isAppError(err) && err.details) {
    response.error.details = err.details;
  }

  if (process.env.NODE_ENV !== 'production' && err.stack) {
    response.error.stack = err.stack;
  }

  res.status(statusCode).json(response);
}

