import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { addDoc, collection, getDocs, serverTimestamp, type Firestore } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-telemetry',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());

const anon = () => env.unauthenticatedContext().firestore() as unknown as Firestore;
const ctx = { os: 'Android', browser: 'Chrome', mobile: true, app: 'web' };
const flash = {
  kind: 'flash',
  board: 'aries-v3',
  protocol: 'vega-xmodem',
  transport: 'webusb',
  ok: false,
  durationMs: 4200,
  bytes: 4396,
  error: 'DisconnectedError',
  ...ctx,
};

describe('telemetry', () => {
  it('anyone (even signed out) can append well-formed compile and flash events', async () => {
    await assertSucceeds(
      addDoc(collection(anon(), 'telemetry'), { ...flash, at: serverTimestamp() }),
    );
    await assertSucceeds(
      addDoc(collection(anon(), 'telemetry'), {
        kind: 'compile',
        board: 'aries-v3',
        mode: 'ram',
        ok: true,
        durationMs: 1400,
        cached: false,
        ...ctx,
        at: serverTimestamp(),
      }),
    );
  });

  it.each([
    ['an identifying field', { ...flash, uid: 'abc' }],
    ['source code', { ...flash, code: 'void setup(){}' }],
    ['a huge string', { ...flash, error: 'x'.repeat(500) }],
    ['an unknown kind', { ...flash, kind: 'keystrokes' }],
    ['a client-chosen time', { ...flash }],
  ])('rejects %s', async (_, data) => {
    const at =
      'at' in data
        ? {}
        : _ === 'a client-chosen time'
          ? { at: new Date() }
          : { at: serverTimestamp() };
    await assertFails(addDoc(collection(anon(), 'telemetry'), { ...data, ...at }));
  });

  it('only admins can read events', async () => {
    const student = env.authenticatedContext('s1').firestore() as unknown as Firestore;
    const admin = env
      .authenticatedContext('a1', { role: 'admin' })
      .firestore() as unknown as Firestore;
    await assertFails(getDocs(collection(anon(), 'telemetry')));
    await assertFails(getDocs(collection(student, 'telemetry')));
    await assertSucceeds(getDocs(collection(admin, 'telemetry')));
  });
});
