import { collection, getDocs, orderBy, query, where, type Firestore } from 'firebase/firestore';
import { COLLECTIONS, type Example } from '../schema.ts';
import type { ContentRepository } from '../services.ts';

export function createFirestoreContentRepository(db: Firestore): ContentRepository {
  return {
    async listExamples(boardId) {
      // Rules only let users read published examples, so the query must filter on it.
      const snap = await getDocs(
        query(
          collection(db, COLLECTIONS.examples),
          where('published', '==', true),
          orderBy('order'),
        ),
      );
      return snap.docs
        .map((d) => ({ ...(d.data() as Example), id: d.id }))
        .filter((e) => e.boardIds.length === 0 || e.boardIds.includes(boardId));
    },
  };
}
