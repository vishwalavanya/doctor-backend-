# Setup Guide

## 1. Install Dependencies

```bash
npm install
```

## 2. Configure Firebase

This backend uses the Firebase Web SDK, not `firebase-admin`.

1. Create or open your Firebase project
2. Register a web app
3. Copy the web app config values into `.env`
4. Enable Firestore in your Firebase project
5. Make sure your Firestore security rules allow the access model you intend to use

Required values:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

## 3. Configure Google Calendar

1. Open Google Cloud Console
2. Create or select a project
3. Enable the Google Calendar API
4. Configure OAuth consent screen
5. Create OAuth client credentials for a web application
6. Add your frontend redirect URI if the frontend sends an auth `code`
7. Put the client ID, client secret, and API key into `.env`

Required values:

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_API_KEY`

The backend supports exchanging an authorization code through `POST /calendar/google/connect`.

## 4. Configure Zoom

1. Create a Zoom Server-to-Server OAuth app in Zoom Marketplace
2. Copy the account ID, client ID, and client secret
3. Add them to `.env`
4. Grant the meeting scopes needed for create, update, delete, and read operations

Required values:

- `ZOOM_ACCOUNT_ID`
- `ZOOM_CLIENT_ID`
- `ZOOM_CLIENT_SECRET`

## 5. Configure Render

1. Create a new Render web service
2. Connect your Git repository
3. Use the provided `render.yaml`
4. Add the environment variables from `.env.example`
5. Deploy the service

Render will run:

```bash
npm start
```

## 6. Verify the Deployment

1. Open `GET /health`
2. Confirm the server status is `ok`
3. Confirm Google, Zoom, and Firebase show the correct configuration state

