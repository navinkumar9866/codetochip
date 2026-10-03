import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

/** Google's public keys for Firebase Auth ID tokens. */
const FIREBASE_KEYS =
  'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

/** The signed-in user a token belongs to, or null if it may not compile. */
export type VerifyUser = (token: string) => Promise<{ uid: string } | null>;

/**
 * Accepts Firebase ID tokens for `projectId` from signed-in users. Guests (anonymous sign-in)
 * are refused, since anyone gets one without signing up.
 */
export function firebaseVerifier(
  projectId: string,
  keys: JWTVerifyGetKey = createRemoteJWKSet(new URL(FIREBASE_KEYS)),
): VerifyUser {
  return async (token) => {
    try {
      const { payload } = await jwtVerify(token, keys, {
        issuer: `https://securetoken.google.com/${projectId}`,
        audience: projectId,
        algorithms: ['RS256'],
      });
      const provider = (payload.firebase as { sign_in_provider?: string } | undefined)
        ?.sign_in_provider;
      if (!payload.sub || provider === 'anonymous') return null;
      return { uid: payload.sub };
    } catch {
      return null;
    }
  };
}
