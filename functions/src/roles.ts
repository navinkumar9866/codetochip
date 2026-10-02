import { isRole, ROLES, type Role } from '@codetochip/data';

export class RoleChangeError extends Error {
  constructor(
    readonly code:
      | 'unauthenticated'
      | 'permission-denied'
      | 'invalid-argument'
      | 'not-found'
      | 'failed-precondition',
    message: string,
  ) {
    super(message);
  }
}

export interface RoleDeps {
  getClaims(uid: string): Promise<Record<string, unknown> | null>;
  setClaims(uid: string, claims: Record<string, unknown>): Promise<void>;
  /** Audit trail in roles/{uid}, readable by admins. */
  record(uid: string, entry: { role: Role; changedBy: string }): Promise<void>;
}

/**
 * Changes a user's role (a custom claim users can't edit themselves). Admins only; an admin
 * can't remove their own admin role, so nobody locks themselves out.
 */
export async function changeRole(
  deps: RoleDeps,
  caller: { uid: string; role?: unknown } | null,
  data: unknown,
): Promise<{ uid: string; role: Role }> {
  if (!caller) throw new RoleChangeError('unauthenticated', 'Sign in first.');
  if (caller.role !== 'admin') {
    throw new RoleChangeError('permission-denied', 'Only admins can change roles.');
  }
  const { uid, role } = (data ?? {}) as { uid?: unknown; role?: unknown };
  if (typeof uid !== 'string' || !uid || !isRole(role)) {
    throw new RoleChangeError('invalid-argument', `Choose a user and one of: ${ROLES.join(', ')}.`);
  }
  if (uid === caller.uid && role !== 'admin') {
    throw new RoleChangeError(
      'failed-precondition',
      'You can’t remove your own admin role. Ask another admin to do it.',
    );
  }
  const claims = await deps.getClaims(uid);
  if (!claims) throw new RoleChangeError('not-found', 'That user doesn’t exist.');
  await deps.setClaims(uid, { ...claims, role });
  await deps.record(uid, { role, changedBy: caller.uid });
  return { uid, role };
}

export interface UserRow {
  uid: string;
  name: string | null;
  email: string | null;
  role: Role;
}

/** Every account with its real role (from its claims). Admins only. */
export async function listUsersWithRoles(
  listAll: () => Promise<
    { uid: string; displayName?: string; email?: string; customClaims?: Record<string, unknown> }[]
  >,
  caller: { uid: string; role?: unknown } | null,
): Promise<UserRow[]> {
  if (!caller) throw new RoleChangeError('unauthenticated', 'Sign in first.');
  if (caller.role !== 'admin') {
    throw new RoleChangeError('permission-denied', 'Only admins can see everyone’s roles.');
  }
  const users = await listAll();
  return users
    .map((u) => ({
      uid: u.uid,
      name: u.displayName ?? null,
      email: u.email ?? null,
      role: isRole(u.customClaims?.role) ? u.customClaims.role : ('student' as Role),
    }))
    .sort((a, b) => (a.name ?? a.email ?? '').localeCompare(b.name ?? b.email ?? ''));
}
