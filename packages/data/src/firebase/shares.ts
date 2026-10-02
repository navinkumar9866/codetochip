import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  Timestamp,
  type Firestore,
} from 'firebase/firestore';
import { COLLECTIONS, validateProjectInput } from '../schema.ts';
import { InvalidProjectError, NotSignedInError, type ShareRepository } from '../services.ts';

export function createFirestoreShareRepository(
  db: Firestore,
  getUid: () => string | null,
): ShareRepository {
  const shares = collection(db, COLLECTIONS.shares);
  return {
    async create(input) {
      const uid = getUid();
      if (!uid) throw new NotSignedInError();
      const error = validateProjectInput(input);
      if (error) throw new InvalidProjectError(error);
      const { name, boardId, files } = input;
      const ref = await addDoc(shares, {
        name,
        boardId,
        files,
        ownerId: uid,
        createdAt: serverTimestamp(),
      });
      return { id: ref.id, name, boardId, files, ownerId: uid, createdAt: new Date() };
    },
    async get(id) {
      const snap = await getDoc(doc(shares, id));
      if (!snap.exists()) return null;
      const d = snap.data({ serverTimestamps: 'estimate' });
      return {
        id: snap.id,
        name: d.name,
        boardId: d.boardId,
        files: d.files,
        ownerId: d.ownerId,
        createdAt: d.createdAt instanceof Timestamp ? d.createdAt.toDate() : new Date(),
      };
    },
    async remove(id) {
      await deleteDoc(doc(shares, id));
    },
  };
}
