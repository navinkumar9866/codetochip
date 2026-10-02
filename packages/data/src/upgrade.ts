import type { AppServices } from './services.ts';

/**
 * Google sign-in that never loses a guest's work. Usually the guest account is upgraded in
 * place (same uid). If the Google account already existed, the user lands in that account
 * instead, so the guest's projects are copied across before they become unreachable.
 */
export async function signInWithGoogleKeepingWork(services: AppServices) {
  return signInKeepingWork(services, () => services.auth.signInWithGoogle());
}

/** Runs any sign-in so a guest's projects survive it (see signInWithGoogleKeepingWork). */
export async function signInKeepingWork(
  { auth, projects }: AppServices,
  signIn: () => Promise<unknown>,
) {
  const before = auth.currentUser();
  const guestProjects = before?.isAnonymous ? await projects.listMine() : [];
  await signIn();
  const after = auth.currentUser();
  if (!before?.isAnonymous || !after || after.uid === before.uid) return { copied: 0 };
  for (const p of guestProjects) {
    await projects.create({ name: p.name, boardId: p.boardId, files: p.files });
  }
  return { copied: guestProjects.length };
}
