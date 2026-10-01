import { validateProjectInput, type Project, type ProjectInput } from './schema.ts';
import {
  InvalidProjectError,
  NotSignedInError,
  type AppServices,
  type AppUser,
  type AuthService,
  type ProjectRepository,
} from './services.ts';

/** In-memory services for tests, Storybook-style previews and offline demos. */
export function createMemoryServices(initialUser: AppUser | null = null): AppServices & {
  setUser(user: AppUser | null): void;
} {
  let user = initialUser;
  const listeners = new Set<(u: AppUser | null) => void>();
  const setUser = (u: AppUser | null) => {
    user = u;
    for (const l of listeners) l(u);
  };

  const auth: AuthService = {
    onChange(cb) {
      listeners.add(cb);
      cb(user);
      return () => listeners.delete(cb);
    },
    async signInWithGoogle() {
      setUser({
        uid: 'memory-user',
        displayName: 'Test User',
        email: 'test@example.com',
        photoURL: null,
        role: 'student',
        isAnonymous: false,
      });
    },
    async signOut() {
      setUser(null);
    },
  };

  return { auth, projects: createMemoryProjectRepository(() => user?.uid ?? null), setUser };
}

export function createMemoryProjectRepository(getUid: () => string | null): ProjectRepository {
  const store = new Map<string, Project>();
  let nextId = 1;

  const requireUid = () => {
    const uid = getUid();
    if (!uid) throw new NotSignedInError();
    return uid;
  };
  const owned = (id: string, uid: string) => {
    const p = store.get(id);
    return p && p.ownerId === uid ? p : null;
  };
  const check = (input: Partial<ProjectInput>) => {
    const error = validateProjectInput(input);
    if (error) throw new InvalidProjectError(error);
  };

  return {
    async listMine() {
      const uid = requireUid();
      return [...store.values()]
        .filter((p) => p.ownerId === uid)
        .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
    },
    async get(id) {
      return structuredClone(owned(id, requireUid()));
    },
    async create(input) {
      const uid = requireUid();
      check(input);
      const now = new Date();
      const project: Project = {
        ...structuredClone(input),
        id: String(nextId++),
        ownerId: uid,
        createdAt: now,
        updatedAt: now,
      };
      store.set(project.id, project);
      return structuredClone(project);
    },
    async update(id, patch) {
      const p = owned(id, requireUid());
      if (!p) throw new Error('Project not found.');
      check(patch);
      Object.assign(p, structuredClone(patch), { updatedAt: new Date() });
    },
    async remove(id) {
      if (owned(id, requireUid())) store.delete(id);
    },
  };
}
