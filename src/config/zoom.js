export const zoomConfig = {
  accountId: process.env.ZOOM_ACCOUNT_ID,
  clientId: process.env.ZOOM_CLIENT_ID,
  clientSecret: process.env.ZOOM_CLIENT_SECRET
};

export function isZoomConfigured() {
  return Boolean(zoomConfig.accountId && zoomConfig.clientId && zoomConfig.clientSecret);
}

