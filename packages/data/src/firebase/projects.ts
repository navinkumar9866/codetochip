import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  where,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase/firestore';
import { COLLECTIONS, validateProjectInput, type Project, type ProjectInput } from '../schema.ts';
import { InvalidProjectError, NotSignedInError, type ProjectRepository } from '../services.ts';

export function createFirestoreProjectRepository(
  db: Firestore,
  getUid: () => string | null,
): ProjectRepository {
  const projects = collection(db, COLLECTIONS.projects);

  const requireUid = () => {
    const uid = getUid();
    if (!uid) throw new NotSignedInError();
    return uid;
  };
  const check = (input: Partial<ProjectInput>) => {
    const error = validateProjectInput(input);
    if (error) throw new InvalidProjectError(error);
  };

  return {
    async listMine() {
      const uid = requireUid();
      const snap = await getDocs(
        query(projects, where('ownerId', '==', uid), orderBy('updatedAt', 'desc')),
      );
      return snap.docs.map(fromSnapshot);
    },
    async get(id) {
      requireUid();
      const snap = await getDoc(doc(projects, id));
      return snap.exists() ? fromSnapshot(snap) : null;
    },
    async create(input) {
      const uid = requireUid();
      check(input);
      const ref = await addDoc(projects, {
        ...input,
        ownerId: uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      const now = new Date();
      return { ...input, id: ref.id, ownerId: uid, createdAt: now, updatedAt: now };
    },
    async update(id, patch) {
      requireUid();
      check(patch);
      await updateDoc(doc(projects, id), { ...patch, updatedAt: serverTimestamp() });
    },
    async remove(id) {
      requireUid();
      await deleteDoc(doc(projects, id));
    },
  };
}

function fromSnapshot(snap: DocumentSnapshot): Project {
  const d = snap.data({ serverTimestamps: 'estimate' }) ?? {};
  return {
    id: snap.id,
    ownerId: d.ownerId,
    name: d.name,
    boardId: d.boardId,
    files: d.files,
    createdAt: toDate(d.createdAt),
    updatedAt: toDate(d.updatedAt),
  };
}

const toDate = (v: unknown) => (v instanceof Timestamp ? v.toDate() : new Date());
