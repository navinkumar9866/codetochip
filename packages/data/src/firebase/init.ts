import { initializeApp, type FirebaseApp, type FirebaseOptions } from 'firebase/app';
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';
import {
  connectFirestoreEmulator,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from 'firebase/firestore';

/** Emulator-only project id. The `demo-` prefix stops the emulators touching any real project. */
export const DEMO_PROJECT_ID = 'demo-codetochip';

/** The Vite env vars we read. All optional: with none set, we run against the emulators. */
export interface FirebaseEnv {
  VITE_FIREBASE_API_KEY?: string;
  VITE_FIREBASE_AUTH_DOMAIN?: string;
  VITE_FIREBASE_PROJECT_ID?: string;
  VITE_FIREBASE_STORAGE_BUCKET?: string;
  VITE_FIREBASE_APP_ID?: string;
  VITE_USE_EMULATORS?: string;
  /** Host the emulators are reachable on; set to your LAN IP to test from a phone. */
  VITE_EMULATOR_HOST?: string;
}

export interface ResolvedFirebaseConfig {
  options: FirebaseOptions;
  emulatorHost: string | null;
}

export function resolveFirebaseConfig(env: FirebaseEnv): ResolvedFirebaseConfig {
  const projectId = env.VITE_FIREBASE_PROJECT_ID;
  const useEmulators = !projectId || env.VITE_USE_EMULATORS === 'true';
  if (!projectId) {
    return {
      options: {
        apiKey: 'demo-api-key',
        projectId: DEMO_PROJECT_ID,
        authDomain: `${DEMO_PROJECT_ID}.firebaseapp.com`,
        storageBucket: `${DEMO_PROJECT_ID}.appspot.com`,
      },
      emulatorHost: env.VITE_EMULATOR_HOST ?? '127.0.0.1',
    };
  }
  const options: FirebaseOptions = { projectId };
  if (env.VITE_FIREBASE_API_KEY) options.apiKey = env.VITE_FIREBASE_API_KEY;
  if (env.VITE_FIREBASE_AUTH_DOMAIN) options.authDomain = env.VITE_FIREBASE_AUTH_DOMAIN;
  if (env.VITE_FIREBASE_STORAGE_BUCKET) options.storageBucket = env.VITE_FIREBASE_STORAGE_BUCKET;
  if (env.VITE_FIREBASE_APP_ID) options.appId = env.VITE_FIREBASE_APP_ID;
  return { options, emulatorHost: useEmulators ? (env.VITE_EMULATOR_HOST ?? '127.0.0.1') : null };
}

export interface FirebaseServices {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
}

/** Ports must match firebase.json. */
export const EMULATOR_PORTS = { auth: 9099, firestore: 8080, storage: 9199 };

export function initFirebase({ options, emulatorHost }: ResolvedFirebaseConfig): FirebaseServices {
  const app = initializeApp(options);
  const auth = getAuth(app);
  // Offline-first: projects stay readable and editable without a network (ADR 0001).
  const db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
  });
  if (emulatorHost) {
    connectAuthEmulator(auth, `http://${emulatorHost}:${EMULATOR_PORTS.auth}`, {
      disableWarnings: true,
    });
    connectFirestoreEmulator(db, emulatorHost, EMULATOR_PORTS.firestore);
  }
  // Storage is only used by the admin (media uploads): see ./storage.ts. Keeping it out of
  // here keeps the Storage SDK out of the student-facing app's download.
  return { app, auth, db };
}
