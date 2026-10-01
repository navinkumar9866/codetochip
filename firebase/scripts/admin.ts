import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const DEMO_PROJECT_ID = 'demo-codetochip';

/**
 * Admin SDK against the local emulators by default. To target a real project, set
 * FIREBASE_PROJECT_ID and GOOGLE_APPLICATION_CREDENTIALS (service account JSON).
 */
export function initAdmin() {
  const projectId = process.env.FIREBASE_PROJECT_ID ?? DEMO_PROJECT_ID;
  if (projectId === DEMO_PROJECT_ID) {
    process.env.FIRESTORE_EMULATOR_HOST ??= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ??= '127.0.0.1:9099';
  }
  const app = initializeApp({ projectId });
  return { projectId, auth: getAuth(app), db: getFirestore(app) };
}
