export const googleConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  apiKey: process.env.GOOGLE_API_KEY
};

export function isGoogleConfigured() {
  return Boolean(googleConfig.clientId && googleConfig.clientSecret);
}

