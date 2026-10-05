import {
  createUserWithEmailAndPassword,
  EmailAuthProvider,
  GoogleAuthProvider,
  isSignInWithEmailLink,
  linkWithCredential,
  sendPasswordResetEmail,
  sendSignInLinkToEmail,
  signInWithEmailAndPassword,
  updateProfile,
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
import {
  AuthError,
  MIN_PASSWORD_LENGTH,
  SignInCancelledError,
  type AppUser,
  type AuthService,
} from '../services.ts';

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
          user = (await plain(() => linkWithPopup(current, provider))).user;
        } catch (e) {
          // This Google account (or its email) already has an account: sign into that instead.
          const cause = (e as { cause?: unknown }).cause ?? e;
          if (!SWITCH_ACCOUNT.has((cause as { code?: string }).code ?? '')) throw e;
          const credential = GoogleAuthProvider.credentialFromError(cause as never);
          user = (
            await plain(() =>
              credential ? signInWithCredential(auth, credential) : signInWithPopup(auth, provider),
            )
          ).user;
        }
      } else {
        user = (await plain(() => signInWithPopup(auth, provider))).user;
      }
      await upsertProfile(db, user);
      await refresh(user);
    },

    async signInWithPassword(email, password) {
      const user = await plain(() => signInWithEmailAndPassword(auth, email, password)).then(
        (r) => r.user,
      );
      await upsertProfile(db, user);
      await refresh(user);
    },
    async createAccount({ name, email, password }) {
      if (password.length < MIN_PASSWORD_LENGTH) throw new AuthError(TOO_SHORT);
      const current = auth.currentUser;
      const { user } = await plain(() =>
        current?.isAnonymous
          ? // Upgrade the guest in place so their work stays with them.
            linkWithCredential(current, EmailAuthProvider.credential(email, password))
          : createUserWithEmailAndPassword(auth, email, password),
      );
      if (name.trim()) await updateProfile(user, { displayName: name.trim() });
      await upsertProfile(db, user);
      await refresh(user);
    },
    async sendPasswordReset(email) {
      try {
        await sendPasswordResetEmail(auth, email);
      } catch (e) {
        // Unknown addresses aren't an error to show: that would reveal who has an account.
        if ((e as { code?: string }).code !== 'auth/user-not-found') throw toAuthError(e);
      }
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

const TOO_SHORT = `Use a password of at least ${MIN_PASSWORD_LENGTH} characters.`;

/** Runs a Firebase sign-in call, turning its error codes into messages that say what to do. */
async function plain<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    throw toAuthError(e);
  }
}

/** Linking a guest failed because the sign-in already belongs to an account. */
const SWITCH_ACCOUNT = new Set([
  'auth/credential-already-in-use',
  'auth/email-already-in-use',
  'auth/account-exists-with-different-credential',
]);

function toAuthError(e: unknown): Error {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') {
    return new SignInCancelledError();
  }
  const message = (
    {
      'auth/invalid-credential':
        'That email and password don’t match. Check them and try again, or use “Forgot password?”. If you signed up with Google or an email link, use that instead.',
      'auth/wrong-password':
        'That email and password don’t match. Check them and try again, or use “Forgot password?”.',
      'auth/user-not-found':
        'That email and password don’t match. Check them and try again, or create an account.',
      'auth/email-already-in-use':
        'There’s already an account with this email. Log in instead, or use “Forgot password?”.',
      'auth/credential-already-in-use':
        'There’s already an account with this email. Log in instead, or use “Forgot password?”.',
      'auth/invalid-email': 'That doesn’t look like an email address. Check it and try again.',
      'auth/weak-password': TOO_SHORT,
      'auth/password-does-not-meet-requirements': TOO_SHORT,
      'auth/too-many-requests':
        'Too many tries for now. Wait a few minutes, or use “Forgot password?”.',
      'auth/network-request-failed': 'Couldn’t reach the sign-in server. Check your connection.',
      'auth/popup-blocked':
        'The Google sign-in window was blocked. Allow popups for this site, then try again.',
      'auth/unauthorized-domain':
        'Google sign-in isn’t set up for this web address yet. Use codetochip.in, or sign in with email.',
      'auth/user-disabled': 'This account has been turned off. Ask your teacher or contact us.',
    } as Record<string, string>
  )[code];
  return message ? new AuthError(message, { cause: e }) : (e as Error);
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
