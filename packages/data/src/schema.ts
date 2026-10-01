// Firestore data model. firebase/firestore.rules enforces the same limits;
// firebase/test checks the two agree.

export const COLLECTIONS = {
  users: 'users',
  projects: 'projects',
  examples: 'examples',
  lessons: 'lessons',
  pages: 'pages',
  settings: 'settings',
} as const;

export const ROLES = ['student', 'teacher', 'editor', 'admin'] as const;
export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const PROJECT_LIMITS = {
  maxFiles: 32,
  maxNameLength: 100,
  maxBoardIdLength: 64,
  /** Matches the compiler's input limit (docs/PLAN.md, Phase 2.2). */
  maxTotalBytes: 256 * 1024,
  allowedExtensions: ['.ino', '.c', '.cpp', '.h', '.hpp'],
} as const;

export interface ProjectFile {
  path: string;
  content: string;
}

export interface ProjectInput {
  name: string;
  boardId: string;
  files: ProjectFile[];
}

export interface Project extends ProjectInput {
  id: string;
  ownerId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface UserProfile {
  displayName: string | null;
  email: string | null;
  photoURL: string | null;
}

/** Content managed by editors in apps/admin. */
export interface Example {
  title: string;
  description: string;
  boardIds: string[];
  files: ProjectFile[];
  published: boolean;
  order: number;
}

export interface Lesson {
  title: string;
  slug: string;
  /** Markdown. */
  body: string;
  boardIds: string[];
  published: boolean;
  order: number;
}

export interface Page {
  title: string;
  /** Markdown. */
  body: string;
  published: boolean;
}

/** Document `settings/site`. */
export interface SiteSettings {
  announcement: string;
  maintenanceMode: boolean;
}

/**
 * Checks a project before saving. Returns a message a user can act on, or null if valid.
 */
export function validateProjectInput(p: Partial<ProjectInput>): string | null {
  const L = PROJECT_LIMITS;
  if (p.name !== undefined) {
    const name = p.name.trim();
    if (!name) return 'Give your project a name.';
    if (name.length > L.maxNameLength)
      return `Project names can be at most ${L.maxNameLength} characters.`;
  }
  if (p.boardId !== undefined && (!p.boardId || p.boardId.length > L.maxBoardIdLength)) {
    return 'Pick a board for this project.';
  }
  if (p.files !== undefined) {
    if (p.files.length === 0) return 'A project needs at least one file.';
    if (p.files.length > L.maxFiles)
      return `A project can have at most ${L.maxFiles} files. Remove some files and try again.`;
    for (const f of p.files) {
      if (!L.allowedExtensions.some((ext) => f.path.endsWith(ext))) {
        return `"${f.path}" can't be added. Allowed file types: ${L.allowedExtensions.join(' ')}.`;
      }
      if (f.path.startsWith('/') || f.path.split('/').includes('..')) {
        return `"${f.path}" isn't a valid file name. Use a name like "sketch.ino" or "lib/helper.h".`;
      }
    }
    const bytes = p.files.reduce((n, f) => n + new TextEncoder().encode(f.content).length, 0);
    if (bytes > L.maxTotalBytes) {
      return `This project is too large (${Math.ceil(bytes / 1024)} KB). The limit is ${L.maxTotalBytes / 1024} KB.`;
    }
  }
  return null;
}
