import { describe, expect, it } from 'vitest';
import { changeRole, listUsersWithRoles, RoleChangeError, type RoleDeps } from '../src/roles.ts';

function fakeDeps(users: Record<string, Record<string, unknown>>) {
  const audit: { uid: string; role: string; changedBy: string }[] = [];
  const deps: RoleDeps = {
    getClaims: async (uid) => users[uid] ?? null,
    setClaims: async (uid, claims) => void (users[uid] = claims),
    record: async (uid, entry) => void audit.push({ uid, ...entry }),
  };
  return { deps, users, audit };
}

const admin = { uid: 'boss', role: 'admin' };

describe('changeRole', () => {
  it('lets an admin make someone a teacher, keeping other claims, with an audit entry', async () => {
    const f = fakeDeps({ boss: { role: 'admin' }, asha: { role: 'student', beta: true } });
    expect(await changeRole(f.deps, admin, { uid: 'asha', role: 'teacher' })).toEqual({
      uid: 'asha',
      role: 'teacher',
    });
    expect(f.users.asha).toEqual({ role: 'teacher', beta: true });
    expect(f.audit).toEqual([{ uid: 'asha', role: 'teacher', changedBy: 'boss' }]);
  });

  it.each([
    [null, { uid: 'asha', role: 'teacher' }, 'unauthenticated'],
    [{ uid: 'ed', role: 'editor' }, { uid: 'asha', role: 'teacher' }, 'permission-denied'],
    [{ uid: 'asha' }, { uid: 'asha', role: 'admin' }, 'permission-denied'],
    [admin, { uid: 'asha', role: 'superuser' }, 'invalid-argument'],
    [admin, { role: 'teacher' }, 'invalid-argument'],
    [admin, null, 'invalid-argument'],
    [admin, { uid: 'ghost', role: 'teacher' }, 'not-found'],
    [admin, { uid: 'boss', role: 'student' }, 'failed-precondition'],
  ])('refuses: caller %o, data %o → %s', async (caller, data, code) => {
    const f = fakeDeps({ boss: { role: 'admin' }, asha: { role: 'student' } });
    const error = await changeRole(f.deps, caller, data).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(RoleChangeError);
    expect((error as RoleChangeError).code).toBe(code);
    expect(f.users.asha).toEqual({ role: 'student' });
    expect(f.audit).toEqual([]);
  });
});

describe('listUsersWithRoles', () => {
  const all = async () => [
    { uid: 'b', displayName: 'Ravi', customClaims: { role: 'teacher' } },
    { uid: 'a', email: 'asha@example.com' },
    { uid: 'c', displayName: 'Boss', customClaims: { role: 'admin', beta: true } },
    { uid: 'd', displayName: 'Odd', customClaims: { role: 'wizard' } },
  ];
  it('returns real roles from claims (student when unset or unknown), sorted by name', async () => {
    expect(await listUsersWithRoles(all, admin)).toEqual([
      { uid: 'a', name: null, email: 'asha@example.com', role: 'student' },
      { uid: 'c', name: 'Boss', email: null, role: 'admin' },
      { uid: 'd', name: 'Odd', email: null, role: 'student' },
      { uid: 'b', name: 'Ravi', email: null, role: 'teacher' },
    ]);
  });
  it('is admin-only', async () => {
    await expect(listUsersWithRoles(all, { uid: 'x', role: 'editor' })).rejects.toThrow(
      'Only admins',
    );
    await expect(listUsersWithRoles(all, null)).rejects.toThrow('Sign in first');
  });
});
