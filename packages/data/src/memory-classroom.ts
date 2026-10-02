import {
  JOIN_CODE_ALPHABET,
  JOIN_CODE_LENGTH,
  validateProjectInput,
  type Assignment,
  type ClassInfo,
  type ClassMember,
  type Submission,
} from './schema.ts';
import {
  ClassroomError,
  NotSignedInError,
  type AppUser,
  type ClassroomRepository,
} from './services.ts';

/** In-memory classroom with the same permission checks as the Firestore rules. */
export function createMemoryClassroom(getUser: () => AppUser | null): ClassroomRepository {
  const classes = new Map<string, ClassInfo>();
  const members = new Map<string, Map<string, ClassMember>>();
  const assignments = new Map<string, Assignment[]>();
  const submissions = new Map<string, Map<string, Submission>>();
  let next = 1;

  const me = () => {
    const u = getUser();
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
  const name = (u: AppUser) => u.displayName ?? u.email ?? 'Student';
  const owned = (classId: string) => {
    const c = classes.get(classId);
    if (!c || c.ownerId !== me().uid)
      throw new ClassroomError('Only the class’s teacher can do that.');
    return c;
  };
  const canSee = (classId: string) => {
    const c = classes.get(classId);
    const uid = me().uid;
    return !!c && (c.ownerId === uid || !!members.get(classId)?.has(uid));
  };

  return {
    async createClass({ name: className, boardId }) {
      const u = named();
      if (u.role !== 'teacher' && u.role !== 'admin') {
        throw new ClassroomError(
          'Only teachers can create classes. Ask an admin for the teacher role.',
        );
      }
      if (!className.trim()) throw new ClassroomError('Give the class a name.');
      const joinCode = Array.from(
        { length: JOIN_CODE_LENGTH },
        (_, i) => JOIN_CODE_ALPHABET[(next * 7 + i * 3) % JOIN_CODE_ALPHABET.length],
      ).join('');
      const c: ClassInfo = {
        id: `class-${next++}`,
        name: className.trim(),
        boardId,
        ownerId: u.uid,
        ownerName: name(u),
        joinCode,
      };
      classes.set(c.id, c);
      return { ...c };
    },
    async teachingClasses() {
      const uid = me().uid;
      return [...classes.values()].filter((c) => c.ownerId === uid);
    },
    async members(classId) {
      owned(classId);
      return [...(members.get(classId)?.values() ?? [])];
    },
    async createAssignment(classId, input) {
      owned(classId);
      if (!input.title.trim()) throw new ClassroomError('Give the assignment a title.');
      const a: Assignment = { ...structuredClone(input), id: `a-${next++}`, createdAt: new Date() };
      assignments.set(classId, [a, ...(assignments.get(classId) ?? [])]);
      return structuredClone(a);
    },
    async submissions(classId, assignmentId) {
      owned(classId);
      return [...(submissions.get(`${classId}/${assignmentId}`)?.values() ?? [])];
    },
    async joinClass(code) {
      const u = named();
      const clean = code
        .trim()
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '');
      const c = [...classes.values()].find((x) => x.joinCode === clean);
      if (!c) {
        throw new ClassroomError(
          'No class has that code. Check it with your teacher (codes are 6 letters and numbers).',
        );
      }
      const m = members.get(c.id) ?? new Map();
      m.set(u.uid, { uid: u.uid, displayName: name(u), joinedAt: new Date() });
      members.set(c.id, m);
      return { ...c };
    },
    async joinedClasses() {
      const uid = me().uid;
      return [...classes.values()].filter((c) => members.get(c.id)?.has(uid));
    },
    async submit(classId, assignmentId, files) {
      const u = me();
      if (!members.get(classId)?.has(u.uid)) throw new ClassroomError('Join the class first.');
      const error = validateProjectInput({ files });
      if (error) throw new ClassroomError(error);
      const key = `${classId}/${assignmentId}`;
      const s = submissions.get(key) ?? new Map();
      s.set(u.uid, {
        uid: u.uid,
        displayName: name(u),
        files: structuredClone(files),
        submittedAt: new Date(),
      });
      submissions.set(key, s);
    },
    async mySubmission(classId, assignmentId) {
      return submissions.get(`${classId}/${assignmentId}`)?.get(me().uid) ?? null;
    },
    async getClass(classId) {
      return canSee(classId) ? { ...classes.get(classId)! } : null;
    },
    async assignments(classId) {
      if (!canSee(classId)) return [];
      return structuredClone(assignments.get(classId) ?? []);
    },
  };
}
