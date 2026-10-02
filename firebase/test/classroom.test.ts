// The real classroom repository against the emulator with the real rules.
import { readFileSync } from 'node:fs';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  type Firestore,
} from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { ClassroomError } from '@codetochip/data';
import { createFirestoreClassroomRepository } from '@codetochip/data/firebase';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-codetochip-classroom',
    firestore: { rules: readFileSync(new URL('../firestore.rules', import.meta.url), 'utf8') },
  });
});
afterAll(() => env.cleanup());
beforeEach(() => env.clearFirestore());

type Person = { uid: string; name: string; role?: string; anonymous?: boolean };
const people = {
  teacher: { uid: 't1', name: 'Ms Rao', role: 'teacher' },
  otherTeacher: { uid: 't2', name: 'Mr Iyer', role: 'teacher' },
  asha: { uid: 's1', name: 'Asha' },
  ravi: { uid: 's2', name: 'Ravi' },
  guest: { uid: 'g1', name: '', anonymous: true },
} satisfies Record<string, Person>;

const dbOf = (p: Person) =>
  env
    .authenticatedContext(p.uid, {
      ...(p.role && { role: p.role }),
      firebase: { sign_in_provider: p.anonymous ? 'anonymous' : 'google.com' },
    })
    .firestore() as unknown as Firestore;
const as = (p: Person) =>
  createFirestoreClassroomRepository(dbOf(p), {
    currentUser: {
      uid: p.uid,
      displayName: p.name || null,
      email: null,
      isAnonymous: !!p.anonymous,
    },
  });

const starter = [{ path: 'blink.ino', content: 'void setup(){}\nvoid loop(){}' }];

async function classWithAssignment() {
  const cls = await as(people.teacher).createClass({
    name: 'Grade 9 Robotics',
    boardId: 'aries-v3',
  });
  const a = await as(people.teacher).createAssignment(cls.id, {
    title: 'Blink the LED',
    instructions: 'Make it blink twice a second.',
    boardId: 'aries-v3',
    files: starter,
  });
  return { cls, a };
}

describe('teachers', () => {
  it('create a class with a 6-character code; students cannot', async () => {
    const cls = await as(people.teacher).createClass({
      name: 'Grade 9 Robotics',
      boardId: 'aries-v3',
    });
    expect(cls.joinCode).toMatch(/^[2-9A-HJKMNP-Z]{6}$/);
    expect((await as(people.teacher).teachingClasses()).map((c) => c.name)).toEqual([
      'Grade 9 Robotics',
    ]);
    await expect(
      as(people.asha).createClass({ name: 'Mine', boardId: 'aries-v3' }),
    ).rejects.toThrow(ClassroomError);
  });

  it('cannot see another teacher’s class, members or submissions', async () => {
    const { cls, a } = await classWithAssignment();
    await as(people.asha).joinClass(cls.joinCode);
    expect(await as(people.otherTeacher).getClass(cls.id)).toBeNull();
    await expect(as(people.otherTeacher).members(cls.id)).rejects.toThrow();
    await expect(as(people.otherTeacher).submissions(cls.id, a.id)).rejects.toThrow();
  });
});

describe('students', () => {
  it('join with the code (any case, with spaces), see assignments and submit', async () => {
    const { cls, a } = await classWithAssignment();
    const joined = await as(people.asha).joinClass(
      ` ${cls.joinCode.toLowerCase().slice(0, 3)} ${cls.joinCode.slice(3)} `,
    );
    expect(joined.name).toBe('Grade 9 Robotics');
    expect((await as(people.asha).joinedClasses()).map((c) => c.id)).toEqual([cls.id]);
    expect((await as(people.asha).assignments(cls.id)).map((x) => x.title)).toEqual([
      'Blink the LED',
    ]);

    await as(people.asha).submit(cls.id, a.id, [{ path: 'blink.ino', content: '// done' }]);
    expect((await as(people.asha).mySubmission(cls.id, a.id))?.files[0]?.content).toBe('// done');

    expect((await as(people.teacher).members(cls.id)).map((m) => m.displayName)).toEqual(['Asha']);
    expect((await as(people.teacher).submissions(cls.id, a.id)).map((s) => s.displayName)).toEqual([
      'Asha',
    ]);
  });

  it('get a clear message for a wrong code, and must sign in with Google to join', async () => {
    const { cls } = await classWithAssignment();
    await expect(as(people.asha).joinClass('ZZZZZZ')).rejects.toThrow(/No class has that code/);
    await expect(as(people.asha).joinClass('12')).rejects.toThrow(/No class has that code/);
    await expect(as(people.guest).joinClass(cls.joinCode)).rejects.toThrow(/Sign in with Google/);
  });

  it('cannot join by writing a membership with the wrong code (rules check it)', async () => {
    const { cls } = await classWithAssignment();
    await assertFails(
      setDoc(doc(dbOf(people.ravi), 'classes', cls.id, 'members', people.ravi.uid), {
        uid: people.ravi.uid,
        displayName: 'Ravi',
        joinedAt: serverTimestamp(),
        code: 'WRONG1',
      }),
    );
    // ...nor as an anonymous guest with the right code.
    await assertFails(
      setDoc(doc(dbOf(people.guest), 'classes', cls.id, 'members', people.guest.uid), {
        uid: people.guest.uid,
        displayName: 'Guest',
        joinedAt: serverTimestamp(),
        code: cls.joinCode,
      }),
    );
  });

  it('outsiders see nothing; members cannot read classmates’ work or write assignments', async () => {
    const { cls, a } = await classWithAssignment();
    expect(await as(people.ravi).getClass(cls.id)).toBeNull();
    expect(
      await as(people.ravi)
        .assignments(cls.id)
        .catch(() => 'denied'),
    ).toBe('denied');
    await expect(as(people.ravi).submit(cls.id, a.id, starter)).rejects.toThrow();

    await as(people.asha).joinClass(cls.joinCode);
    await as(people.ravi).joinClass(cls.joinCode);
    await as(people.ravi).submit(cls.id, a.id, starter);
    await assertFails(
      getDoc(doc(dbOf(people.asha), 'classes', cls.id, 'assignments', a.id, 'submissions', 's2')),
    );
    await assertFails(getDocs(collection(dbOf(people.asha), 'classes', cls.id, 'members')));
    await expect(
      as(people.asha).createAssignment(cls.id, {
        title: 'Hack',
        instructions: '',
        boardId: 'aries-v3',
        files: [],
      }),
    ).rejects.toThrow();
  });

  it('cannot browse join codes', async () => {
    await classWithAssignment();
    await assertFails(getDocs(collection(dbOf(people.asha), 'classCodes')));
  });
});
