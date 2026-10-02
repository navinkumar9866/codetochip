// Real Firebase email-link sign-in through the Auth emulator, including upgrading a guest.
import { initializeApp } from 'firebase/app';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { beforeAll, describe, expect, it } from 'vitest';
import { createFirebaseAuthService } from '@codetochip/data/firebase';

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const PROJECT = 'demo-codetochip';

/** The emulator keeps "sent" emails instead of sending them. */
async function latestLink(email: string): Promise<string> {
  const res = await fetch(`http://${authHost}/emulator/v1/projects/${PROJECT}/oobCodes`);
  const { oobCodes } = (await res.json()) as {
    oobCodes: { email: string; requestType: string; oobLink: string }[];
  };
  const mine = oobCodes.filter((c) => c.email === email && c.requestType === 'EMAIL_SIGNIN');
  return mine.at(-1)!.oobLink;
}

describe.skipIf(!authHost)('email sign-in link (Auth emulator)', () => {
  const app = initializeApp({ apiKey: 'demo', projectId: PROJECT }, 'email-link-test');
  const auth = getAuth(app);
  const db = getFirestore(app);
  const service = createFirebaseAuthService(auth, db);

  beforeAll(() => {
    connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
    const [host, port] = (process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080').split(':');
    connectFirestoreEmulator(db, host!, Number(port));
  });

  it('upgrades a guest in place (same account, so their projects stay)', async () => {
    const guest = await service.ensureUser();
    expect(guest.isAnonymous).toBe(true);
    const email = `kiran-${Date.now()}@example.com`;
    await service.sendEmailLink(email, 'http://localhost:5173/ide');
    const link = await latestLink(email);

    expect(await service.completeEmailLink('http://localhost:5173/ide', email)).toBe(false);
    expect(await service.completeEmailLink(link, email)).toBe(true);
    expect(service.currentUser()).toMatchObject({ uid: guest.uid, email, isAnonymous: false });
    await service.signOut();
  });

  it('asks for the email when the link is opened on another device', async () => {
    const email = `ravi-${Date.now()}@example.com`;
    await service.sendEmailLink(email, 'http://localhost:5173/');
    const link = await latestLink(email);
    // No email remembered here (Node has no localStorage): the UI must ask for it.
    await expect(service.completeEmailLink(link)).rejects.toThrow('Enter the email address');
    expect(await service.completeEmailLink(link, email)).toBe(true);
    expect(service.currentUser()).toMatchObject({ email, isAnonymous: false });
    await service.signOut();
  });
});
