// The real content/projects implementations against the emulator with the real rules.
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createFirestoreContentRepository,
  createFirestoreProjectRepository,
} from '@codetochip/data/firebase';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-content',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const ex = (title: string, order: number, boardIds: string[], published: boolean) => ({
      title,
      description: '',
      boardIds,
      files: [],
      published,
      order,
    });
    await setDoc(doc(db, 'examples/b'), ex('B', 2, [], true));
    await setDoc(doc(db, 'examples/a'), ex('A', 1, ['aries-v3'], true));
    await setDoc(doc(db, 'examples/other'), ex('Other board', 0, ['esp32'], true));
    await setDoc(doc(db, 'examples/draft'), ex('Draft', 0, [], false));
  });
});
afterAll(() => env.cleanup());

describe('examples for signed-out visitors and guests', () => {
  it.each([
    ['signed-out visitor', () => env.unauthenticatedContext()],
    [
      'anonymous guest',
      () => env.authenticatedContext('guest-1', { firebase: { sign_in_provider: 'anonymous' } }),
    ],
  ])('%s sees published examples for the board, in order, never drafts', async (_, ctx) => {
    const content = createFirestoreContentRepository(ctx().firestore() as unknown as Firestore);
    expect((await content.listExamples('aries-v3')).map((e) => e.title)).toEqual(['A', 'B']);
  });
});

describe('guests can save work', () => {
  it('an anonymous user can create and list their own project', async () => {
    const db = env
      .authenticatedContext('guest-2', { firebase: { sign_in_provider: 'anonymous' } })
      .firestore() as unknown as Firestore;
    const projects = createFirestoreProjectRepository(db, () => 'guest-2');
    await projects.create({
      name: 'Blink',
      boardId: 'aries-v3',
      files: [{ path: 'blink.ino', content: '' }],
    });
    expect((await projects.listMine()).map((p) => p.name)).toEqual(['Blink']);
  });
});
