import type { Project, ProjectInput, Role } from './schema.ts';

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
  signInWithGoogle(): Promise<void>;
  signOut(): Promise<void>;
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
