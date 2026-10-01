import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-rules',
    storage: { rules: readFileSync(new URL('../storage.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());

const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const storageAs = (uid: string, role?: string) =>
  env.authenticatedContext(uid, role ? { role } : {}).storage();

describe('media storage', () => {
  it('lets editors upload images and everyone read them', async () => {
    const path = 'media/board.png';
    await assertSucceeds(
      uploadBytes(ref(storageAs('ed', 'editor'), path), png, { contentType: 'image/png' }),
    );
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(), path)));
  });

  it('rejects uploads from students and non-image files', async () => {
    await assertFails(
      uploadBytes(ref(storageAs('alice'), 'media/a.png'), png, { contentType: 'image/png' }),
    );
    await assertFails(
      uploadBytes(ref(storageAs('ed', 'editor'), 'media/a.js'), png, {
        contentType: 'text/javascript',
      }),
    );
  });
});
