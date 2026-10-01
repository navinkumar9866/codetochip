import { describe, expect, it } from 'vitest';
import {
  createMemoryServices,
  InvalidProjectError,
  NotSignedInError,
  PROJECT_LIMITS,
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
