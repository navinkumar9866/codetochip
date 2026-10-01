// Runs the real Firestore implementation from packages/data against the emulator,
// with the real rules loaded, so the client code and the rules are tested together.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import type { Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { InvalidProjectError, NotSignedInError, type ProjectInput } from '@codetochip/data';
import { createFirestoreProjectRepository } from '@codetochip/data/firebase';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-repo',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

const repoFor = (uid: string | null) => {
  const ctx = uid ? env.authenticatedContext(uid) : env.unauthenticatedContext();
  return createFirestoreProjectRepository(ctx.firestore() as unknown as Firestore, () => uid);
};

const blink: ProjectInput = {
  name: 'Blink',
  boardId: 'test-board',
  files: [{ path: 'blink.ino', content: 'void setup() {}\nvoid loop() {}\n' }],
};

describe('Firestore project repository', () => {
  it('creates, lists, updates, reads and deletes a project', async () => {
    const repo = repoFor('alice');
    const created = await repo.create(blink);
    await repo.create({ ...blink, name: 'Second' });
    await repo.update(created.id, { name: 'Renamed' });

    const list = await repo.listMine();
    expect(list.map((p) => p.name)).toEqual(['Renamed', 'Second']);
    expect(list[0]?.files).toEqual(blink.files);
    expect(list[0]?.ownerId).toBe('alice');

    await repo.remove(created.id);
    expect(await repo.get(created.id)).toBeNull();
  });

  it('does not let another user read the project', async () => {
    const { id } = await repoFor('alice').create(blink);
    await expect(repoFor('bob').get(id)).rejects.toThrow();
    expect(await repoFor('bob').listMine()).toEqual([]);
  });

  it('validates before writing and requires sign-in', async () => {
    await expect(repoFor('alice').create({ ...blink, files: [] })).rejects.toBeInstanceOf(
      InvalidProjectError,
    );
    await expect(repoFor(null).create(blink)).rejects.toBeInstanceOf(NotSignedInError);
  });
});
