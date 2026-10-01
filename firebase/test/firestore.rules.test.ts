import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';
import { PROJECT_LIMITS } from '@codetochip/data';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-rules',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const as = (uid: string, role?: string) =>
  env.authenticatedContext(uid, role ? { role } : {}).firestore();
const anon = () => env.unauthenticatedContext().firestore();

const project = (ownerId: string, extra: Record<string, unknown> = {}) => ({
  ownerId,
  name: 'Blink',
  boardId: 'test-board',
  files: [{ path: 'blink.ino', content: '' }],
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  ...extra,
});

/** Writes a document bypassing rules, to set up a test. */
const seed = (path: string, data: Record<string, unknown>) =>
  env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), path), data));

describe('projects', () => {
  it('lets a user create, read, update and delete their own project', async () => {
    const db = as('alice');
    const ref = doc(db, 'projects/p1');
    await assertSucceeds(setDoc(ref, project('alice')));
    await assertSucceeds(getDoc(ref));
    await assertSucceeds(updateDoc(ref, { name: 'Renamed', updatedAt: serverTimestamp() }));
    await assertSucceeds(deleteDoc(ref));
  });

  it('reports a missing project as missing, not forbidden', async () => {
    await assertSucceeds(getDoc(doc(as('alice'), 'projects/nope')));
    await assertFails(getDoc(doc(anon(), 'projects/nope')));
  });

  it('only lets users list their own projects', async () => {
    const mine = query(collection(as('alice'), 'projects'), where('ownerId', '==', 'alice'));
    const all = query(collection(as('alice'), 'projects'));
    await assertSucceeds(getDocs(mine));
    await assertFails(getDocs(all));
  });

  it('rejects creating a project owned by someone else', async () => {
    await assertFails(setDoc(doc(as('alice'), 'projects/p1'), project('bob')));
  });

  it('rejects signed-out writes', async () => {
    await assertFails(setDoc(doc(anon(), 'projects/p1'), project('alice')));
  });

  it('hides projects from other users, including admins', async () => {
    await seed('projects/p1', {
      ...project('alice'),
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
    await assertFails(getDoc(doc(as('bob'), 'projects/p1')));
    await assertFails(getDoc(doc(as('root', 'admin'), 'projects/p1')));
  });

  it('rejects changing the owner or createdAt', async () => {
    const ref = doc(as('alice'), 'projects/p1');
    await assertSucceeds(setDoc(ref, project('alice')));
    await assertFails(updateDoc(ref, { ownerId: 'bob', updatedAt: serverTimestamp() }));
    await assertFails(
      updateDoc(ref, { createdAt: Timestamp.fromMillis(0), updatedAt: serverTimestamp() }),
    );
  });

  it('enforces the same file-count limit as packages/data', async () => {
    const files = (n: number) =>
      Array.from({ length: n }, (_, i) => ({ path: `f${i}.h`, content: '' }));
    const db = as('alice');
    await assertSucceeds(
      setDoc(doc(db, 'projects/ok'), project('alice', { files: files(PROJECT_LIMITS.maxFiles) })),
    );
    await assertFails(
      setDoc(
        doc(db, 'projects/big'),
        project('alice', { files: files(PROJECT_LIMITS.maxFiles + 1) }),
      ),
    );
  });

  it('rejects unknown fields and client-chosen timestamps', async () => {
    const db = as('alice');
    await assertFails(setDoc(doc(db, 'projects/a'), project('alice', { isFeatured: true })));
    await assertFails(
      setDoc(doc(db, 'projects/b'), project('alice', { updatedAt: Timestamp.now() })),
    );
  });
});

describe('users', () => {
  const profile = {
    displayName: 'Alice',
    email: 'a@example.com',
    photoURL: null,
    createdAt: serverTimestamp(),
  };

  it('lets users write their own profile but not a role', async () => {
    const db = as('alice');
    await assertSucceeds(setDoc(doc(db, 'users/alice'), profile));
    await assertFails(setDoc(doc(db, 'users/alice'), { ...profile, role: 'admin' }));
    await assertFails(setDoc(doc(db, 'users/bob'), profile));
  });

  it('lets only the owner and admins read a profile', async () => {
    await seed('users/alice', { ...profile, createdAt: Timestamp.now() });
    await assertSucceeds(getDoc(doc(as('alice'), 'users/alice')));
    await assertSucceeds(getDoc(doc(as('root', 'admin'), 'users/alice')));
    await assertFails(getDoc(doc(as('bob'), 'users/alice')));
    await assertFails(getDoc(doc(as('ed', 'editor'), 'users/alice')));
  });
});

describe.each(['examples', 'lessons', 'pages'])('%s', (coll) => {
  it('shows published items to everyone and drafts only to editors', async () => {
    await seed(`${coll}/live`, { title: 'Live', published: true });
    await seed(`${coll}/draft`, { title: 'Draft', published: false });
    await assertSucceeds(getDoc(doc(anon(), `${coll}/live`)));
    await assertFails(getDoc(doc(anon(), `${coll}/draft`)));
    await assertFails(getDoc(doc(as('alice'), `${coll}/draft`)));
    await assertSucceeds(getDoc(doc(as('ed', 'editor'), `${coll}/draft`)));
  });

  it('lets only editors and admins write', async () => {
    await assertFails(setDoc(doc(as('alice'), `${coll}/x`), { title: 'x', published: true }));
    await assertFails(
      setDoc(doc(as('t', 'teacher'), `${coll}/x`), { title: 'x', published: true }),
    );
    await assertSucceeds(
      setDoc(doc(as('ed', 'editor'), `${coll}/x`), { title: 'x', published: true }),
    );
    await assertSucceeds(
      setDoc(doc(as('root', 'admin'), `${coll}/y`), { title: 'y', published: true }),
    );
  });
});

describe('settings', () => {
  it('is readable by everyone and writable only by admins', async () => {
    await seed('settings/site', { announcement: '', maintenanceMode: false });
    await assertSucceeds(getDoc(doc(anon(), 'settings/site')));
    await assertFails(updateDoc(doc(as('ed', 'editor'), 'settings/site'), { announcement: 'hi' }));
    await assertSucceeds(
      updateDoc(doc(as('root', 'admin'), 'settings/site'), { announcement: 'hi' }),
    );
  });
});
