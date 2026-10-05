// Google sign-in for a guest whose Google email already has an account (e.g. made by email link),
// through the Auth emulator. Popups can't open here, so they sign in with a fake Google token.
import { initializeApp } from 'firebase/app';
import * as firebaseAuth from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createFirebaseAuthService } from '@codetochip/data/firebase';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-codetochip';
const googleEmail = `asha-${Date.now()}@gmail.com`;
const googleCredential = () =>
  firebaseAuth.GoogleAuthProvider.credential(
    JSON.stringify({ sub: `g-${googleEmail}`, email: googleEmail, email_verified: true }),
  );

vi.mock('firebase/auth', async (real) => {
  const actual = await real<typeof firebaseAuth>();
  return {
    ...actual,
    linkWithPopup: (user: firebaseAuth.User) => actual.linkWithCredential(user, googleCredential()),
    signInWithPopup: (auth: firebaseAuth.Auth) =>
      actual.signInWithCredential(auth, googleCredential()),
  };
});

describe.skipIf(!authHost)('Google sign-in when the email already has an account', () => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, 'google-switch-test');
  const auth = firebaseAuth.getAuth(app);
  const db = getFirestore(app);
  const service = createFirebaseAuthService(auth, db);

  beforeAll(() => {
    firebaseAuth.connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    connectFirestoreEmulator(db, host!, Number(port));
  });

  it('signs the guest into that existing account', async () => {
    await service.createAccount({ name: '', email: googleEmail, password: 'blink-led-1' });
    const existing = service.currentUser()!.uid;
    await service.signOut();

    const guest = await service.ensureUser();
    await service.signInWithGoogle();
    expect(service.currentUser()).toMatchObject({
      uid: existing,
      email: googleEmail,
      isAnonymous: false,
    });
    expect(existing).not.toBe(guest.uid);
    await service.signOut();
  });
});
