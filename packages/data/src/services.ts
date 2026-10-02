import type { Example, Project, ProjectInput, Role } from './schema.ts';

export interface AppUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
  role: Role;
  isAnonymous: boolean;
}

export interface AuthService {
  /** Calls back immediately with the current user (or null), then on every change. */
  onChange(cb: (user: AppUser | null) => void): () => void;
  /** The current user, or null if nobody (not even a guest) is signed in. */
  currentUser(): AppUser | null;
  /** Signs in as an anonymous guest if nobody is signed in, so work can be saved at once. */
  ensureUser(): Promise<AppUser>;
  /**
   * Google sign-in. A guest's account is upgraded in place (same uid, same projects); if that
   * Google account already exists, the user is signed into it instead (uid changes).
   */
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
}

/** Published content managed by editors in apps/admin. */
export interface ContentRepository {
  /** Published examples for a board (plus those for every board), in display order. */
  listExamples(boardId: string): Promise<(Example & { id: string })[]>;
}

/** The signed-in user's saved projects. Every method throws NotSignedInError when signed out. */
export interface ProjectRepository {
  listMine(): Promise<Project[]>;
  get(id: string): Promise<Project | null>;
  create(input: ProjectInput): Promise<Project>;
  update(id: string, patch: Partial<ProjectInput>): Promise<void>;
  remove(id: string): Promise<void>;
}

export interface AppServices {
  auth: AuthService;
  projects: ProjectRepository;
  content: ContentRepository;
}

export class NotSignedInError extends Error {
  constructor() {
    super('Sign in to save your projects.');
    this.name = 'NotSignedInError';
  }
}

export class InvalidProjectError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidProjectError';
  }
}
