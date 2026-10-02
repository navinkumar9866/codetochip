// setUserRole through the real Functions + Auth emulators, called like the admin app calls it.
import { initializeApp as initAdmin, getApps as getAdminApps } from 'firebase-admin/app';
import { getAuth as adminAuth } from 'firebase-admin/auth';
import { getFirestore as adminDb } from 'firebase-admin/firestore';
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { beforeAll, describe, expect, it } from 'vitest';

const enabled = !!process.env.FIREBASE_AUTH_EMULATOR_HOST && !!process.env.FUNCTIONS_EMULATOR_PORT;
const PROJECT = 'demo-codetochip';

describe.skipIf(!enabled)('setUserRole Cloud Function (emulator)', () => {
  const client = initializeApp({ apiKey: 'demo', projectId: PROJECT }, 'functions-test');
  const auth = getAuth(client);
  const setUserRole = httpsCallable(getFunctions(client, 'asia-south1'), 'setUserRole');
  const listUsers = httpsCallable(getFunctions(client, 'asia-south1'), 'listUsers');

  beforeAll(async () => {
    const [host, port] = process.env.FIREBASE_AUTH_EMULATOR_HOST!.split(':');
    connectAuthEmulator(auth, `http://${host}:${port}`, { disableWarnings: true });
    connectFunctionsEmulator(
      getFunctions(client, 'asia-south1'),
      '127.0.0.1',
      Number(process.env.FUNCTIONS_EMULATOR_PORT),
    );
    if (!getAdminApps().length) initAdmin({ projectId: PROJECT });
    for (const [uid, role] of [
      ['boss', 'admin'],
      ['asha', 'student'],
    ] as const) {
      await adminAuth()
        .deleteUser(uid)
        .catch(() => {});
      await adminAuth().createUser({ uid, email: `${uid}@example.com`, password: 'password' });
      await adminAuth().setCustomUserClaims(uid, { role });
    }
  });

  it('an admin makes a student a teacher; the claim and audit record change', async () => {
    await signInWithEmailAndPassword(auth, 'boss@example.com', 'password');
    await expect(setUserRole({ uid: 'asha', role: 'teacher' })).resolves.toMatchObject({
      data: { uid: 'asha', role: 'teacher' },
    });
    expect((await adminAuth().getUser('asha')).customClaims).toEqual({ role: 'teacher' });
    expect((await adminDb().doc('roles/asha').get()).data()).toMatchObject({
      role: 'teacher',
      changedBy: 'boss',
    });
    const { data } = await listUsers();
    expect(data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ uid: 'asha', email: 'asha@example.com', role: 'teacher' }),
        expect.objectContaining({ uid: 'boss', role: 'admin' }),
      ]),
    );
    await signOut(auth);
  });

  it('refuses non-admins with a readable message', async () => {
    await signInWithEmailAndPassword(auth, 'asha@example.com', 'password');
    await expect(setUserRole({ uid: 'asha', role: 'admin' })).rejects.toThrow(
      'Only admins can change roles.',
    );
    await signOut(auth);
  });
});
