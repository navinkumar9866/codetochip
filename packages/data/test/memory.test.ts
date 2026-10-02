import { describe, expect, it } from 'vitest';
import {
  createMemoryServices,
  InvalidProjectError,
  NotSignedInError,
  PROJECT_LIMITS,
  signInWithGoogleKeepingWork,
  lazyServices,
  validateProjectInput,
  type AppUser,
  type ProjectInput,
} from '../src/index.ts';

const alice: AppUser = {
  uid: 'alice',
  displayName: 'Alice',
  email: 'alice@example.com',
  photoURL: null,
  role: 'student',
  isAnonymous: false,
};
const blink: ProjectInput = {
  name: 'Blink',
  boardId: 'test-board',
  files: [{ path: 'blink.ino', content: 'void setup() {}\nvoid loop() {}\n' }],
};

describe('memory project repository', () => {
  it('saves and lists only the signed-in user’s projects, newest first', async () => {
    const s = createMemoryServices(alice);
    const first = await s.projects.create(blink);
    const second = await s.projects.create({ ...blink, name: 'Second' });
    await s.projects.update(first.id, { name: 'Renamed' });
    expect((await s.projects.listMine()).map((p) => p.name)).toEqual(['Renamed', 'Second']);

    s.setUser({ ...alice, uid: 'bob' });
    expect(await s.projects.listMine()).toEqual([]);
    expect(await s.projects.get(second.id)).toBeNull();
  });

  it('requires sign-in', async () => {
    const s = createMemoryServices(null);
    await expect(s.projects.create(blink)).rejects.toBeInstanceOf(NotSignedInError);
  });

  it('rejects invalid projects with an actionable message', async () => {
    const s = createMemoryServices(alice);
    await expect(
      s.projects.create({ ...blink, files: [{ path: '../etc/passwd.h', content: '' }] }),
    ).rejects.toBeInstanceOf(InvalidProjectError);
  });
});

describe('validateProjectInput', () => {
  it('accepts a normal sketch', () => {
    expect(validateProjectInput(blink)).toBeNull();
  });

  it.each([
    [{ name: '  ' }, /name/],
    [{ files: [] }, /at least one file/],
    [{ files: [{ path: 'a.exe', content: '' }] }, /Allowed file types/],
    [{ files: [{ path: '/abs.h', content: '' }] }, /valid file name/],
    [
      {
        files: Array.from({ length: PROJECT_LIMITS.maxFiles + 1 }, (_, i) => ({
          path: `f${i}.h`,
          content: '',
        })),
      },
      /at most/,
    ],
    [
      { files: [{ path: 'big.ino', content: 'x'.repeat(PROJECT_LIMITS.maxTotalBytes + 1) }] },
      /too large/,
    ],
  ])('rejects %o', (input, message) => {
    expect(validateProjectInput(input)).toMatch(message);
  });
});

describe('guests and Google sign-in', () => {
  it('saves work as a guest, then keeps it when upgrading in place', async () => {
    const s = createMemoryServices();
    expect(s.auth.currentUser()).toBeNull();
    const guest = await s.auth.ensureUser();
    expect(guest.isAnonymous).toBe(true);
    expect(await s.auth.ensureUser()).toBe(s.auth.currentUser());
    await s.projects.create(blink);
    expect(await signInWithGoogleKeepingWork(s)).toEqual({ copied: 0 });
    expect(s.auth.currentUser()).toMatchObject({ uid: guest.uid, isAnonymous: false });
    expect(await s.projects.listMine()).toHaveLength(1);
  });

  it('copies a guest’s projects into an existing Google account', async () => {
    const s = createMemoryServices(null, { googleAccountExists: true });
    await s.auth.ensureUser();
    await s.projects.create(blink);
    await s.projects.create({ ...blink, name: 'Second' });
    expect(await signInWithGoogleKeepingWork(s)).toEqual({ copied: 2 });
    expect(s.auth.currentUser()?.uid).toBe('memory-user');
    expect((await s.projects.listMine()).map((p) => p.name).sort()).toEqual(['Blink', 'Second']);
  });
});

describe('content', () => {
  it('lists published examples for a board, in order', async () => {
    const ex = (id: string, order: number, boardIds: string[], published = true) => ({
      id,
      title: id,
      description: '',
      boardIds,
      files: [],
      published,
      order,
    });
    const s = createMemoryServices(null, {
      examples: [
        ex('b', 2, []),
        ex('a', 1, ['aries-v3']),
        ex('other', 0, ['esp32']),
        ex('draft', 0, [], false),
      ],
    });
    expect((await s.content.listExamples('aries-v3')).map((e) => e.id)).toEqual(['a', 'b']);
  });
});

describe('lazyServices', () => {
  it('queues calls and auth listeners until the backend has loaded', async () => {
    let resolve!: (s: ReturnType<typeof createMemoryServices>) => void;
    const lazy = lazyServices(() => new Promise((r) => (resolve = r)));
    const seen: (string | null)[] = [];
    const unsubscribe = lazy.auth.onChange((u) => seen.push(u?.uid ?? null));
    expect(lazy.auth.currentUser()).toBeNull();
    const user = lazy.auth.ensureUser();
    expect(seen).toEqual([]);

    const real = createMemoryServices();
    resolve(real);
    expect((await user).isAnonymous).toBe(true);
    expect(lazy.auth.currentUser()?.uid).toBe((await user).uid);
    await lazy.projects.create(blink);
    expect((await lazy.projects.listMine()).map((p) => p.name)).toEqual(['Blink']);
    expect(seen.at(-1)).toBe((await user).uid);
    unsubscribe();
  });
});
