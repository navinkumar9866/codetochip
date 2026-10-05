import {
  validateProjectInput,
  type Example,
  type Project,
  type ProjectInput,
  type Share,
} from './schema.ts';
import {
  AuthError,
  InvalidProjectError,
  MIN_PASSWORD_LENGTH,
  NotSignedInError,
  type AppServices,
  type AppUser,
  type AuthService,
  type ProjectRepository,
} from './services.ts';
import { createMemoryClassroom } from './memory-classroom.ts';

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
  events: Record<string, unknown>[];
  sentLinks: { email: string; link: string }[];
  /** Addresses sent a password-reset email. */
  sentResets: string[];
} {
  let user = initialUser;
  let guests = 0;
  const events: Record<string, unknown>[] = [];
  const sentLinks: { email: string; link: string }[] = [];
  const sentResets: string[] = [];
  const accounts = new Map<string, { password: string; user: AppUser }>();
  let pending: string | null = null;
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
    async signInWithPassword(email, password) {
      const account = accounts.get(email.toLowerCase());
      if (account?.password !== password) {
        throw new AuthError('That email and password don’t match. Check them and try again.');
      }
      setUser(account.user);
    },
    async createAccount({ name, email, password }) {
      if (password.length < MIN_PASSWORD_LENGTH) {
        throw new AuthError(`Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`);
      }
      if (accounts.has(email.toLowerCase())) {
        throw new AuthError('There’s already an account with this email. Log in instead.');
      }
      const account: AppUser = {
        uid: user?.isAnonymous ? user.uid : `email-${email}`,
        displayName: name.trim() || null,
        email,
        photoURL: null,
        role: 'student',
        isAnonymous: false,
      };
      accounts.set(email.toLowerCase(), { password, user: account });
      setUser(account);
    },
    async sendPasswordReset(email) {
      sentResets.push(email);
    },
    async sendEmailLink(email, returnUrl) {
      const link = new URL(returnUrl);
      link.searchParams.set('emailLink', email);
      sentLinks.push({ email, link: link.toString() });
      pending = email;
    },
    async completeEmailLink(url, email) {
      const linked = new URL(url).searchParams.get('emailLink');
      if (!linked) return false;
      const address = email ?? pending;
      if (address !== linked) throw new Error('Enter the email address the link was sent to.');
      const keepUid = user?.isAnonymous && !options.googleAccountExists;
      setUser({
        uid: keepUid ? user!.uid : `email-${address}`,
        displayName: null,
        email: address,
        photoURL: null,
        role: 'student',
        isAnonymous: false,
      });
      pending = null;
      return true;
    },
    pendingEmail: () => pending,
    async signOut() {
      setUser(null);
    },
    // The local compile API doesn't check tokens.
    idToken: async () => (user ? `memory:${user.uid}` : null),
  };

  const content = {
    async listExamples(boardId: string) {
      return (options.examples ?? [])
        .filter((e) => e.published && (e.boardIds.length === 0 || e.boardIds.includes(boardId)))
        .sort((a, b) => a.order - b.order);
    },
  };

  const shareStore = new Map<string, Share>();
  const shares = {
    async create(input: ProjectInput) {
      if (!user) throw new NotSignedInError();
      const error = validateProjectInput(input);
      if (error) throw new InvalidProjectError(error);
      const share: Share = {
        ...structuredClone(input),
        id: `share-${shareStore.size + 1}`,
        ownerId: user.uid,
        createdAt: new Date(),
      };
      shareStore.set(share.id, share);
      return structuredClone(share);
    },
    async get(id: string) {
      const s = shareStore.get(id);
      return s ? structuredClone(s) : null;
    },
    async remove(id: string) {
      if (shareStore.get(id)?.ownerId === user?.uid) shareStore.delete(id);
    },
  };

  return {
    auth,
    projects: createMemoryProjectRepository(() => user?.uid ?? null),
    content,
    shares,
    classroom: createMemoryClassroom(() => user),
    telemetry: { record: (event, context) => void events.push({ ...event, ...context }) },
    /** Recorded telemetry, for tests. */
    events,
    /** Sign-in links "emailed", for tests. */
    sentLinks,
    sentResets,
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
