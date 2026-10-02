import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { changeRole, listUsersWithRoles, RoleChangeError } from './roles.ts';

initializeApp();

/** Called from the admin app (Roles screen). Region matches the rest of the stack (Mumbai). */
export const setUserRole = onCall({ region: 'asia-south1' }, async (request) => {
  try {
    return await changeRole(
      {
        getClaims: (uid) =>
          getAuth()
            .getUser(uid)
            .then((u) => u.customClaims ?? {})
            .catch(() => null),
        setClaims: (uid, claims) => getAuth().setCustomUserClaims(uid, claims),
        record: async (uid, entry) => {
          await getFirestore()
            .doc(`roles/${uid}`)
            .set({ ...entry, changedAt: FieldValue.serverTimestamp() });
        },
      },
      request.auth ? { uid: request.auth.uid, role: request.auth.token.role } : null,
      request.data,
    );
  } catch (e) {
    if (e instanceof RoleChangeError) throw new HttpsError(e.code, e.message);
    throw e;
  }
});

/** Admin Roles screen: all accounts with their real role. Anonymous guests are left out. */
export const listUsers = onCall({ region: 'asia-south1' }, async (request) => {
  try {
    return await listUsersWithRoles(
      async () => {
        const all = [];
        let page: string | undefined;
        do {
          const r = await getAuth().listUsers(1000, page);
          all.push(...r.users.filter((u) => u.providerData.length > 0));
          page = r.pageToken;
        } while (page && all.length < 10_000);
        return all.map((u) => ({
          uid: u.uid,
          ...(u.displayName && { displayName: u.displayName }),
          ...(u.email && { email: u.email }),
          ...(u.customClaims && { customClaims: u.customClaims }),
        }));
      },
      request.auth ? { uid: request.auth.uid, role: request.auth.token.role } : null,
    );
  } catch (e) {
    if (e instanceof RoleChangeError) throw new HttpsError(e.code, e.message);
    throw e;
  }
});
