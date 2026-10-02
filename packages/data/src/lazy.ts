import type { AppServices, AppUser } from './services.ts';

/**
 * Services whose backend loads in the background, so the first screen can render before the
 * backend SDK has downloaded (it is large; students are often on mobile data). Calls made
 * before it arrives wait for it; auth listeners hear nothing until then (the UI treats that
 * as "loading").
 */
export function lazyServices(load: () => Promise<AppServices>): AppServices & {
  ready: Promise<AppServices>;
} {
  const ready = load();
  let real: AppServices | null = null;
  void ready.then((s) => (real = s));
  const later =
    <A extends unknown[], R>(pick: (s: AppServices) => (...args: A) => Promise<R>) =>
    async (...args: A) =>
      pick(await ready)(...args);

  return {
    ready,
    auth: {
      onChange(cb: (user: AppUser | null) => void) {
        let unsubscribe: (() => void) | null = null;
        let cancelled = false;
        void ready.then((s) => {
          if (!cancelled) unsubscribe = s.auth.onChange(cb);
        });
        return () => {
          cancelled = true;
          unsubscribe?.();
        };
      },
      currentUser: () => real?.auth.currentUser() ?? null,
      ensureUser: later((s) => s.auth.ensureUser),
      signInWithGoogle: later((s) => s.auth.signInWithGoogle),
      signOut: later((s) => s.auth.signOut),
    },
    projects: {
      listMine: later((s) => s.projects.listMine),
      get: later((s) => s.projects.get),
      create: later((s) => s.projects.create),
      update: later((s) => s.projects.update),
      remove: later((s) => s.projects.remove),
    },
    content: {
      listExamples: later((s) => s.content.listExamples),
    },
  };
}
