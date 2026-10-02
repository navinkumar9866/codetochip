import {
  collection,
  collectionGroup,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore';
import {
  COLLECTIONS,
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  validateProjectInput,
  type Assignment,
  type ClassInfo,
} from '../schema.ts';
import { ClassroomError, NotSignedInError, type ClassroomRepository } from '../services.ts';

export function newJoinCode(random = Math.random): string {
  return Array.from(
    { length: JOIN_CODE_LENGTH },
    () => JOIN_CODE_ALPHABET[Math.floor(random() * JOIN_CODE_ALPHABET.length)],
  ).join('');
}

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : new Date());
const toClass = (id: string, d: DocumentData): ClassInfo => ({
  id,
  name: d.name,
  boardId: d.boardId,
  ownerId: d.ownerId,
  ownerName: d.ownerName,
  joinCode: d.joinCode,
});

/** Firebase Auth satisfies this; tests pass a plain object. */
export interface CurrentUserSource {
  currentUser: {
    uid: string;
    displayName: string | null;
    email: string | null;
    isAnonymous: boolean;
  } | null;
}

export function createFirestoreClassroomRepository(
  db: Firestore,
  auth: CurrentUserSource,
): ClassroomRepository {
  const me = () => {
    const u = auth.currentUser;
    if (!u) throw new NotSignedInError();
    return u;
  };
  const named = () => {
    const u = me();
    if (u.isAnonymous) {
      throw new ClassroomError('Sign in with Google first, so your teacher can see who you are.');
    }
    return u;
  };
  const classDoc = (id: string) => doc(db, COLLECTIONS.classes, id);
  const assignmentsOf = (classId: string) => collection(classDoc(classId), 'assignments');

  const repo: ClassroomRepository = {
    async createClass({ name, boardId }) {
      const u = named();
      const trimmed = name.trim();
      if (!trimmed) throw new ClassroomError('Give the class a name.');
      // Codes are unique: creating an existing classCodes doc is refused by the rules.
      for (let attempt = 0; attempt < 5; attempt++) {
        const joinCode = newJoinCode();
        const ref = doc(collection(db, COLLECTIONS.classes));
        const batch = writeBatch(db);
        batch.set(ref, {
          name: trimmed,
          boardId,
          ownerId: u.uid,
          ownerName: u.displayName ?? u.email ?? 'Teacher',
          joinCode,
          createdAt: serverTimestamp(),
        });
        batch.set(doc(db, COLLECTIONS.classCodes, joinCode), { classId: ref.id });
        try {
          await batch.commit();
          return toClass(ref.id, {
            name: trimmed,
            boardId,
            ownerId: u.uid,
            ownerName: u.displayName ?? u.email ?? 'Teacher',
            joinCode,
          });
        } catch (e) {
          if ((e as { code?: string }).code !== 'permission-denied') throw e;
          const exists = (
            await getDoc(doc(db, COLLECTIONS.classCodes, joinCode)).catch(() => null)
          )?.exists();
          if (!exists) {
            throw new ClassroomError(
              'Only teachers can create classes. Ask an admin for the teacher role.',
            );
          }
        }
      }
      throw new ClassroomError('Couldn’t create a unique class code. Please try again.');
    },

    async teachingClasses() {
      const snap = await getDocs(
        query(collection(db, COLLECTIONS.classes), where('ownerId', '==', me().uid)),
      );
      return snap.docs
        .map((d) => toClass(d.id, d.data()))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async members(classId) {
      const snap = await getDocs(collection(classDoc(classId), 'members'));
      return snap.docs
        .map((d) => {
          const m = d.data({ serverTimestamps: 'estimate' });
          return { uid: m.uid, displayName: m.displayName, joinedAt: toDate(m.joinedAt) };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },

    async createAssignment(classId, input) {
      me();
      const title = input.title.trim();
      if (!title) throw new ClassroomError('Give the assignment a title.');
      if (input.files.length) {
        const error = validateProjectInput({ files: input.files });
        if (error) throw new ClassroomError(error);
      }
      const ref = doc(assignmentsOf(classId));
      const data = { ...input, title, createdAt: serverTimestamp() };
      await setDoc(ref, data);
      return { ...input, title, id: ref.id, createdAt: new Date() };
    },

    async submissions(classId, assignmentId) {
      const snap = await getDocs(
        collection(doc(assignmentsOf(classId), assignmentId), 'submissions'),
      );
      return snap.docs
        .map((d) => {
          const s = d.data({ serverTimestamps: 'estimate' });
          return {
            uid: s.uid,
            displayName: s.displayName,
            files: s.files,
            submittedAt: toDate(s.submittedAt),
          };
        })
        .sort((a, b) => a.displayName.localeCompare(b.displayName));
    },

    async joinClass(code) {
      const u = named();
      const clean = code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const unknown = new ClassroomError(
        'No class has that code. Check it with your teacher (codes are 6 letters and numbers).',
      );
      if (clean.length !== JOIN_CODE_LENGTH) throw unknown;
      const codeSnap = await getDoc(doc(db, COLLECTIONS.classCodes, clean));
      if (!codeSnap.exists()) throw unknown;
      const classId = codeSnap.data().classId as string;
      await setDoc(doc(classDoc(classId), 'members', u.uid), {
        uid: u.uid,
        displayName: u.displayName ?? u.email ?? 'Student',
        joinedAt: serverTimestamp(),
        code: clean,
      });
      const cls = await repo.getClass(classId);
      if (!cls) throw unknown;
      return cls;
    },

    async joinedClasses() {
      const snap = await getDocs(
        query(collectionGroup(db, 'members'), where('uid', '==', me().uid)),
      );
      const classes = await Promise.all(
        snap.docs.map((d) => repo.getClass(d.ref.parent.parent!.id)),
      );
      return classes.filter((c): c is ClassInfo => !!c);
    },

    async submit(classId, assignmentId, files) {
      const u = me();
      const error = validateProjectInput({ files });
      if (error) throw new ClassroomError(error);
      await setDoc(doc(doc(assignmentsOf(classId), assignmentId), 'submissions', u.uid), {
        uid: u.uid,
        displayName: u.displayName ?? u.email ?? 'Student',
        files,
        submittedAt: serverTimestamp(),
      });
    },

    async mySubmission(classId, assignmentId) {
      const snap = await getDoc(
        doc(doc(assignmentsOf(classId), assignmentId), 'submissions', me().uid),
      );
      if (!snap.exists()) return null;
      const s = snap.data({ serverTimestamps: 'estimate' });
      return {
        uid: s.uid,
        displayName: s.displayName,
        files: s.files,
        submittedAt: toDate(s.submittedAt),
      };
    },

    async getClass(classId) {
      const snap = await getDoc(classDoc(classId)).catch(() => null);
      return snap?.exists() ? toClass(snap.id, snap.data()) : null;
    },

    async assignments(classId) {
      const snap = await getDocs(query(assignmentsOf(classId), orderBy('createdAt', 'desc')));
      return snap.docs.map((d) => {
        const a = d.data({ serverTimestamps: 'estimate' });
        return {
          id: d.id,
          title: a.title,
          instructions: a.instructions,
          boardId: a.boardId,
          files: a.files,
          createdAt: toDate(a.createdAt),
        } satisfies Assignment;
      });
    },
  };
  return repo;
}
