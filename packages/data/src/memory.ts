import { validateProjectInput, type Example, type Project, type ProjectInput } from './schema.ts';
import {
  InvalidProjectError,
  NotSignedInError,
  type AppServices,
  type AppUser,
  type AuthService,
  type ProjectRepository,
} from './services.ts';

export interface MemoryServiceOptions {
  /** Published examples returned by content.listExamples. */
  examples?: (Example & { id: string })[];
  /** Simulate Google sign-in landing in an existing account (the guest's uid changes). */
  googleAccountExists?: boolean;
}

/** In-memory services for tests, Storybook-style previews and offline demos. */
export function createMemoryServices(
  initialUser: AppUser | null = null,
  options: MemoryServiceOptions = {},
): AppServices & {
  setUser(user: AppUser | null): void;
} {
  let user = initialUser;
  let guests = 0;
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
    currentUser: () => user,
    async ensureUser() {
      if (!user) {
        setUser({
          uid: `guest-${++guests}`,
          displayName: null,
          email: null,
          photoURL: null,
          role: 'student',
          isAnonymous: true,
        });
      }
      return user!;
    },
    async signInWithGoogle() {
      const keepUid = user?.isAnonymous && !options.googleAccountExists;
      setUser({
        uid: keepUid ? user!.uid : 'memory-user',
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

  const content = {
    async listExamples(boardId: string) {
      return (options.examples ?? [])
        .filter((e) => e.published && (e.boardIds.length === 0 || e.boardIds.includes(boardId)))
        .sort((a, b) => a.order - b.order);
    },
  };

  return {
    auth,
    projects: createMemoryProjectRepository(() => user?.uid ?? null),
    content,
    setUser,
  };
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
