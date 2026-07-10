import { Router } from 'express';
import { asyncHandler } from '../middlewares/request.middleware.js';
import { connectGoogleAccount } from '../services/calendar.service.js';
import { sendError, sendSuccess } from '../utils/response.js';

const router = Router();
const DEFAULT_GOOGLE_SUCCESS_REDIRECT = 'http://localhost:5173/google-success';

router.get('/auth/google/callback', asyncHandler(async (req, res) => {
  const { code, state } = req.query;
const ownerId = state;
  
  const redirectUri = "http://localhost:3000/auth/google/callback";

  if (!code || !ownerId) {
    return sendError(res, 'code and ownerId are required', 400, {
      code: 'VALIDATION_ERROR',
      details: {
        missing: ['code', 'ownerId'].filter((field) => !req.query?.[field])
      }
    }, {
      requestId: req.requestId
    });
  }

  if (!redirectUri) {
    return sendError(res, 'GOOGLE_REDIRECT_URI is not configured', 500, {
      code: 'GOOGLE_REDIRECT_URI_MISSING'
    }, {
      requestId: req.requestId
    });
  }

  const record = await connectGoogleAccount({
    ownerId,
    code,
    redirectUri,
    doctorId: req.query.doctorId || null,
    calendarId: req.query.calendarId || null
  }, {
    requestId: req.requestId,
    userId: req.userId
  });

  const wantsJson = req.query.format === 'json' || req.accepts(['html', 'json']) === 'json';
  if (wantsJson) {
    return sendSuccess(res, record, 'Google account connected', 200, {
      requestId: req.requestId
    });
  }

  return sendSuccess(
  res,
  record,
  "Google account connected successfully",
  200,
  {
    requestId: req.requestId
  }
);
}));

export default router;
