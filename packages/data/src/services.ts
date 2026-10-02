import type {
  Assignment,
  ClassInfo,
  ClassMember,
  Example,
  Project,
  ProjectFile,
  ProjectInput,
  Role,
  Share,
  Submission,
  TelemetryContext,
  TelemetryEvent,
} from './schema.ts';

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
  /** Emails a sign-in link that comes back to `returnUrl`. */
  sendEmailLink(email: string, returnUrl: string): Promise<void>;
  /**
   * If `url` is a sign-in link, finishes signing in and returns true. `email` is needed when
   * the link is opened on a different device from the one that asked for it.
   */
  completeEmailLink(url: string, email?: string): Promise<boolean>;
  /** The email a link was sent to from this device, if any. */
  pendingEmail(): string | null;
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

/** Read-only share links. Anyone with the link can read; only the owner can delete. */
export interface ShareRepository {
  /** Snapshots the sources; requires a signed-in user (guests are fine). */
  create(input: ProjectInput): Promise<Share>;
  get(id: string): Promise<Share | null>;
  remove(id: string): Promise<void>;
}

/** Classes, assignments and submissions. Teachers need the teacher (or admin) role. */
export interface ClassroomRepository {
  // Teachers
  createClass(input: { name: string; boardId: string }): Promise<ClassInfo>;
  teachingClasses(): Promise<ClassInfo[]>;
  members(classId: string): Promise<ClassMember[]>;
  createAssignment(
    classId: string,
    input: { title: string; instructions: string; boardId: string; files: ProjectFile[] },
  ): Promise<Assignment>;
  submissions(classId: string, assignmentId: string): Promise<Submission[]>;
  // Students
  /** Throws an actionable error for an unknown code. Needs a signed-in (not guest) user. */
  joinClass(code: string): Promise<ClassInfo>;
  joinedClasses(): Promise<ClassInfo[]>;
  submit(classId: string, assignmentId: string, files: ProjectFile[]): Promise<void>;
  mySubmission(classId: string, assignmentId: string): Promise<Submission | null>;
  // Both
  getClass(classId: string): Promise<ClassInfo | null>;
  assignments(classId: string): Promise<Assignment[]>;
}

export class ClassroomError extends Error {
  override name = 'ClassroomError';
}

/** Fire-and-forget usage events; never throws, never blocks the UI. */
export interface TelemetrySink {
  record(event: TelemetryEvent, context: TelemetryContext): void;
}

export interface AppServices {
  auth: AuthService;
  projects: ProjectRepository;
  content: ContentRepository;
  shares: ShareRepository;
  classroom: ClassroomRepository;
  telemetry: TelemetrySink;
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
