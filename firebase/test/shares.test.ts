import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createFirestoreShareRepository } from '@codetochip/data/firebase';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-shares',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const dbFor = (uid: string | null) =>
  (uid
    ? env.authenticatedContext(uid)
    : env.unauthenticatedContext()
  ).firestore() as unknown as Firestore;
const repo = (uid: string | null) => createFirestoreShareRepository(dbFor(uid), () => uid);
const blink = { name: 'Blink', boardId: 'aries-v3', files: [{ path: 'blink.ino', content: 'x' }] };

describe('share links', () => {
  it('anyone with the link can read a share, even signed out', async () => {
    const { id } = await repo('alice').create(blink);
    expect(await repo(null).get(id)).toMatchObject({
      name: 'Blink',
      ownerId: 'alice',
      files: blink.files,
    });
  });

  it('nobody can list shares (no browsing other people’s code)', async () => {
    await repo('alice').create(blink);
    await assertFails(getDocs(collection(dbFor('bob'), 'shares')));
    await assertFails(getDocs(collection(dbFor(null), 'shares')));
  });

  it('shares are immutable, and only the owner deletes', async () => {
    const { id } = await repo('alice').create(blink);
    await assertFails(updateDoc(doc(dbFor('alice'), 'shares', id), { name: 'changed' }));
    await assertFails(repo('bob').remove(id));
    await assertSucceeds(repo('alice').remove(id));
    expect(await repo(null).get(id)).toBeNull();
  });

  it('rejects shares for someone else, signed out, or with extra fields', async () => {
    const share = { ...blink, createdAt: serverTimestamp() };
    await assertFails(setDoc(doc(dbFor('alice'), 'shares/x'), { ...share, ownerId: 'bob' }));
    await assertFails(setDoc(doc(dbFor(null), 'shares/y'), { ...share, ownerId: 'alice' }));
    await assertFails(
      setDoc(doc(dbFor('alice'), 'shares/z'), { ...share, ownerId: 'alice', public: true }),
    );
  });
});
