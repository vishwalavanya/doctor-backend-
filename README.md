# Doctor Scheduler Backend

Production-ready backend for a doctor calendar scheduling system.

## What it does

- Doctor CRUD and availability
- Appointment booking, cancelation, and rescheduling
- Google Calendar sync through OAuth credentials
- Zoom meeting creation through Server-to-Server OAuth
- Conflict detection
- In-memory caching
- Debounced updates and batched syncs
- Background queues with retry handling
- Structured logging
- Health monitoring and webhook ingestion

## Tech Stack

- Node.js
- Express.js
- Firebase Web SDK
- Firestore
- Axios
- Helmet
- Cors
- Compression
- Morgan
- UUID
- dotenv
- Express Rate Limit
- Node Cache

## Installation

```bash
npm install
cp .env.example .env
npm start
```

## Development

```bash
npm run dev
```

## Folder Structure

- `server.js` - app bootstrap
- `src/app.js` - Express app
- `src/config/` - Firebase, Google, Zoom, cache config
- `src/routes/` - route definitions
- `src/controllers/` - request handlers
- `src/services/` - business logic and integrations
- `src/middlewares/` - request and error middleware
- `src/utils/` - helpers, constants, logger, response helpers
- `src/queue/` - in-memory queue manager and workers
- `src/jobs/` - async job handlers

## API Endpoints

### Health

- `GET /health`

### Doctors

- `POST /doctors`
- `GET /doctors`
- `GET /doctors/:doctorId`
- `PUT /doctors/:doctorId`
- `DELETE /doctors/:doctorId`
- `GET /doctors/:doctorId/availability?date=YYYY-MM-DD`
- `POST /doctors/:doctorId/leave-days`
- `DELETE /doctors/:doctorId/leave-days`

### Appointments

- `POST /appointments`
- `GET /appointments`
- `GET /appointments/:appointmentId`
- `PUT /appointments/:appointmentId/reschedule`
- `PATCH /appointments/:appointmentId/cancel`
- `DELETE /appointments/:appointmentId`

### Calendar

- `POST /calendar/google/connect`
- `GET /calendar/google/calendars?ownerId=...`
- `GET /calendar/events`
- `POST /calendar/events`
- `GET /calendar/events/:eventId`
- `PUT /calendar/events/:eventId`
- `DELETE /calendar/events/:eventId`
- `POST /calendar/watch`
- `POST /calendar/watch/stop`
- `POST /calendar/sync`

### Zoom

- `POST /zoom/meetings`
- `GET /zoom/meetings/:meetingId`
- `PUT /zoom/meetings/:meetingId`
- `DELETE /zoom/meetings/:meetingId`

### Webhooks

- `POST /webhooks/google/calendar`
- `POST /webhooks/zoom`

## Request / Response Shape

Success response:

```json
{
  "success": true,
  "message": "Success",
  "data": {},
  "meta": {
    "timestamp": "2026-07-10T00:00:00.000Z",
    "requestId": "..."
  }
}
```

Error response:

```json
{
  "success": false,
  "message": "Request failed",
  "error": {
    "code": "VALIDATION_ERROR",
    "details": {}
  },
  "meta": {
    "timestamp": "2026-07-10T00:00:00.000Z",
    "requestId": "..."
  }
}
```

## System Design Features

- Caching for doctor availability, appointments, and calendar events
- Debounced appointment updates to reduce Google API calls
- Batched async jobs for Google, Zoom, and notifications
- Retry handling with 1s, 2s, 4s, and 8s backoff
- Event-driven queue processing
- Structured JSON logs
- Health endpoint for deployment checks
- Centralized error handling without production stack traces

## Deployment

This backend is ready for Render.

- Set the environment variables listed in `.env.example`
- Use the `render.yaml` in the repo
- Render will start the service with `npm start`
- The app listens on `process.env.PORT`

## Files Requiring Configuration

| Variable Name | Purpose | Where to get it | Example |
| --- | --- | --- | --- |
| `PORT` | HTTP server port | Render service environment variables | `3000` |
| `GOOGLE_CLIENT_ID` | Google OAuth client ID for Calendar access | Google Cloud Console OAuth credentials | `123456.apps.googleusercontent.com` |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret for token exchange | Google Cloud Console OAuth credentials | `GOCSPX-...` |
| `GOOGLE_API_KEY` | Google API key for Google project metadata and auxiliary API use | Google Cloud Console APIs and Services | `AIzaSy...` |
| `ZOOM_ACCOUNT_ID` | Zoom account ID for Server-to-Server OAuth | Zoom Marketplace app credentials | `abc123...` |
| `ZOOM_CLIENT_ID` | Zoom S2S OAuth client ID | Zoom Marketplace app credentials | `zoomClientIdExample` |
| `ZOOM_CLIENT_SECRET` | Zoom S2S OAuth client secret | Zoom Marketplace app credentials | `zoomClientSecretExample` |
| `FIREBASE_API_KEY` | Firebase web app API key | Firebase project settings | `AIzaSy...` |
| `FIREBASE_AUTH_DOMAIN` | Firebase auth domain | Firebase project settings | `your-app.firebaseapp.com` |
| `FIREBASE_PROJECT_ID` | Firebase project ID | Firebase project settings | `your-project-id` |
| `FIREBASE_STORAGE_BUCKET` | Firebase storage bucket | Firebase project settings | `your-app.appspot.com` |
| `FIREBASE_MESSAGING_SENDER_ID` | Firebase messaging sender ID | Firebase project settings | `1234567890` |
| `FIREBASE_APP_ID` | Firebase app ID | Firebase project settings | `1:123456:web:abc123` |
| `JWT_SECRET` | Reserved secret for future signed workflows and internal auth | Generate securely in Render or local env | `replace-with-a-long-random-string` |

Optional runtime variables:

- `NODE_ENV` - toggles production behavior and log verbosity
- `CORS_ORIGIN` - comma-separated list of allowed browser origins
