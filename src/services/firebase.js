import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';

let firebaseApp;

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const getFirebaseApp = () => {
  if (firebaseApp) {
    return firebaseApp;
  }

  const isConfigured = Object.values(firebaseConfig).every(Boolean);
  if (!isConfigured) {
    console.warn('Firebase configuration is missing. Frontend Firebase features are disabled.');
    return null;
  }

  firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);
  return firebaseApp;
};

export const getFirebaseAuth = () => {
  const app = getFirebaseApp();
  return app ? getAuth(app) : null;
};

export const getFirebaseDatabase = () => {
  const app = getFirebaseApp();
  return app ? getDatabase(app) : null;
};

