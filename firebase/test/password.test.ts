// Real Firebase email-and-password sign-in through the Auth emulator, including upgrading a guest.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { AuthError } from '@codetochip/data';
import { createFirebaseAuthService } from '@codetochip/data/firebase';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-codetochip';

describe.skipIf(!authHost)('email and password (Auth emulator)', () => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, 'password-test');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const service = createFirebaseAuthService(auth, db);

  beforeAll(() => {
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    connectFirestoreEmulator(db, host!, Number(port));
  });

  it('upgrades a guest in place on sign-up, then logs back in', async () => {
    const guest = await service.ensureUser();
    const email = `meena-${Date.now()}@example.com`;
    await service.createAccount({ name: 'Meena', email, password: 'blink-led-1' });
    expect(service.currentUser()).toMatchObject({
      uid: guest.uid,
      email,
      displayName: 'Meena',
      isAnonymous: false,
    });
    await service.signOut();

    await service.signInWithPassword(email, 'blink-led-1');
    expect(service.currentUser()).toMatchObject({ uid: guest.uid, email });
    await service.signOut();
  });

  it('explains wrong passwords, taken emails and short passwords in plain words', async () => {
    const email = `arjun-${Date.now()}@example.com`;
    await service.createAccount({ name: '', email, password: 'blink-led-1' });
    await service.signOut();

    const wrong = service.signInWithPassword(email, 'nope-nope');
    await expect(wrong).rejects.toBeInstanceOf(AuthError);
    await expect(wrong).rejects.toThrow(/don’t match/);
    await expect(
      service.createAccount({ name: '', email, password: 'another-one' }),
    ).rejects.toThrow(/already an account/);
    await expect(
      service.createAccount({ name: '', email: `x-${email}`, password: 'short' }),
    ).rejects.toThrow(/at least 8/);
    // Unknown addresses don't fail, so the form can't be used to find out who has an account.
    await expect(service.sendPasswordReset(`nobody-${email}`)).resolves.toBeUndefined();
    await service.sendPasswordReset(email);
  });
});
