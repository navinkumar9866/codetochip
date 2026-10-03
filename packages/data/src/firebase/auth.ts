import {
  EmailAuthProvider,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  linkWithCredential,
  sendSignInLinkToEmail,
  signInWithEmailLink,
  linkWithPopup,
  onIdTokenChanged,
  signInAnonymously,
  signInWithCredential,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { COLLECTIONS, isRole } from '../schema.ts';
import type { AppUser, AuthService } from '../services.ts';

export function createFirebaseAuthService(auth: Auth, db: Firestore): AuthService {
  let cached: AppUser | null = null;
  const refresh = async (user: User | null) => (cached = user ? await toAppUser(user) : null);
  // Keep a synchronous copy for currentUser(); role comes from the ID token's claims.
  onIdTokenChanged(auth, (user) => void refresh(user));

  return {
    onChange(cb) {
      // onIdTokenChanged (not onAuthStateChanged) so role changes arrive on token refresh.
      return onIdTokenChanged(auth, (user) => {
        void refresh(user).then(cb);
      });
    },
    currentUser: () => cached,
    idToken: async () => (auth.currentUser ? auth.currentUser.getIdToken() : null),
    async ensureUser() {
      if (!auth.currentUser) await signInAnonymously(auth);
      return (await refresh(auth.currentUser))!;
    },
    async signInWithGoogle() {
      const provider = new GoogleAuthProvider();
      const current = auth.currentUser;
      let user: User;
      if (current?.isAnonymous) {
        try {
          user = (await linkWithPopup(current, provider)).user;
        } catch (e) {
          // The Google account already exists: sign into it instead.
          const credential = GoogleAuthProvider.credentialFromError(e as never);
          if ((e as { code?: string }).code !== 'auth/credential-already-in-use' || !credential) {
            throw e;
          }
          user = (await signInWithCredential(auth, credential)).user;
        }
      } else {
        user = (await signInWithPopup(auth, provider)).user;
      }
      await upsertProfile(db, user);
      await refresh(user);
    },
    async sendEmailLink(email, returnUrl) {
      await sendSignInLinkToEmail(auth, email, { url: returnUrl, handleCodeInApp: true });
      remember(email);
    },
    async completeEmailLink(url, email) {
      if (!isSignInWithEmailLink(auth, url)) return false;
      const address = email ?? pending();
      if (!address) throw new Error('Enter the email address the link was sent to.');
      const current = auth.currentUser;
      let user: User;
      if (current?.isAnonymous) {
        try {
          // Upgrade the guest in place so their work stays with them.
          user = (
            await linkWithCredential(current, EmailAuthProvider.credentialWithLink(address, url))
          ).user;
        } catch (e) {
          if (
            (e as { code?: string }).code !== 'auth/email-already-in-use' &&
            (e as { code?: string }).code !== 'auth/credential-already-in-use'
          ) {
            throw e;
          }
          user = (await signInWithEmailLink(auth, address, url)).user;
        }
      } else {
        user = (await signInWithEmailLink(auth, address, url)).user;
      }
      remember(null);
      await upsertProfile(db, user);
      await refresh(user);
      return true;
    },
    pendingEmail: () => pending(),
    async signOut() {
      await signOut(auth);
      cached = null;
    },
  };
}

const EMAIL_KEY = 'ctc.emailForSignIn';
const pending = () => {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
};
const remember = (email: string | null) => {
  try {
    if (email) localStorage.setItem(EMAIL_KEY, email);
    else localStorage.removeItem(EMAIL_KEY);
  } catch {
    // Storage blocked: the user will be asked for their email when they open the link.
  }
};

async function toAppUser(user: User): Promise<AppUser> {
  // Offline, the token may not refresh; keep working as a student rather than failing.
  const claims = await user
    .getIdTokenResult()
    .then((r) => r.claims)
    .catch(() => ({}) as Record<string, unknown>);
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
    photoURL: user.photoURL,
    role: isRole(claims.role) ? claims.role : 'student',
    isAnonymous: user.isAnonymous,
  };
}

async function upsertProfile(db: Firestore, user: User): Promise<void> {
  const ref = doc(db, COLLECTIONS.users, user.uid);
  const profile = { displayName: user.displayName, email: user.email, photoURL: user.photoURL };
  const existing = await getDoc(ref);
  await setDoc(ref, existing.exists() ? profile : { ...profile, createdAt: serverTimestamp() }, {
    merge: true,
  });
}
