import { firebaseConfigured } from '../config/firebase.js';
import { getGoogleStatus } from '../services/google.service.js';
import { getZoomStatus } from '../services/zoom.service.js';
import { nowIso } from '../utils/helpers.js';
import { sendSuccess } from '../utils/response.js';

export async function getHealth(req, res) {
  const googleStatus = getGoogleStatus();
  const zoomStatus = getZoomStatus();
  const payload = {
    serverStatus: {
      status: 'ok',
      uptimeSeconds: Math.floor(process.uptime())
    },
    firebaseStatus: {
      status: firebaseConfigured ? 'configured' : 'missing-config',
      configured: firebaseConfigured
    },
    googleStatus: {
      status: googleStatus.configured ? 'configured' : 'missing-config',
      ...googleStatus
    },
    zoomStatus: {
      status: zoomStatus.configured ? 'configured' : 'missing-config',
      ...zoomStatus
    },
    timestamp: nowIso()
  };

  return sendSuccess(res, payload, 'Health check successful');
}
