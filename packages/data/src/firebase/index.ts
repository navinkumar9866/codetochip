import type { AppServices } from '../services.ts';
import { createFirebaseAuthService } from './auth.ts';
import { createFirestoreContentRepository } from './content.ts';
import type { FirebaseServices } from './init.ts';
import { createFirestoreProjectRepository } from './projects.ts';

export * from './init.ts';
export { initFirebaseStorage } from './storage.ts';
export { createFirebaseAuthService } from './auth.ts';
export { createFirestoreProjectRepository } from './projects.ts';
export { createFirestoreContentRepository } from './content.ts';

export function createFirebaseAppServices({ auth, db }: FirebaseServices): AppServices {
  return {
    auth: createFirebaseAuthService(auth, db),
    projects: createFirestoreProjectRepository(db, () => auth.currentUser?.uid ?? null),
    content: createFirestoreContentRepository(db),
  };
}
