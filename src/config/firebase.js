import { initializeApp, getApps } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { logger } from '../utils/logger.js';

const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID,
  measurementId: process.env.FIREBASE_MEASUREMENT_ID
};

const firebaseConfigured = Object.values(firebaseConfig).every((value) => Boolean(value));

let app = null;
let db = null;

if (firebaseConfigured) {
  app = getApps().length > 0 ? getApps()[0] : initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  logger.warn('Firebase is not fully configured. Firestore calls will fail until environment variables are provided.', {
    component: 'firebase.config'
  });
}

export { app, db, firebaseConfig, firebaseConfigured };

