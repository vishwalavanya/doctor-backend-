# Deployment Guide

## Render

1. Push the repository to GitHub
2. Create a Render web service from the repo
3. Ensure `render.yaml` is present at the project root
4. Set all required environment variables
5. Deploy

## Runtime Notes

- The server reads the port from `process.env.PORT`
- The health check path is `/health`
- Queue workers start automatically when the server boots
- In-memory cache and queue state reset on restart

## Production Checklist

- Set `NODE_ENV=production` in Render
- Set all Firebase, Google, and Zoom variables
- Verify Firestore connectivity
- Verify Google OAuth tokens are available for linked doctors
- Verify Zoom S2S OAuth credentials are valid

