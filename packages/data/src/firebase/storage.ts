import type { FirebaseApp } from 'firebase/app';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';
import { EMULATOR_PORTS, type ResolvedFirebaseConfig } from './init.ts';

/** Firebase Storage for apps that upload media (the admin). */
export function initFirebaseStorage(
  app: FirebaseApp,
  { emulatorHost }: ResolvedFirebaseConfig,
): FirebaseStorage {
  const storage = getStorage(app);
  if (emulatorHost) connectStorageEmulator(storage, emulatorHost, EMULATOR_PORTS.storage);
  return storage;
}
