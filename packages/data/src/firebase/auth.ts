import {
  GoogleAuthProvider,
  onIdTokenChanged,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, type Firestore } from 'firebase/firestore';
import { COLLECTIONS, isRole } from '../schema.ts';
import type { AppUser, AuthService } from '../services.ts';

export function createFirebaseAuthService(auth: Auth, db: Firestore): AuthService {
  return {
    onChange(cb) {
      // onIdTokenChanged (not onAuthStateChanged) so role changes arrive on token refresh.
      return onIdTokenChanged(auth, (user) => {
        if (!user) return cb(null);
        void toAppUser(user).then(cb);
      });
    },
    async signInWithGoogle() {
      const { user } = await signInWithPopup(auth, new GoogleAuthProvider());
      await upsertProfile(db, user);
    },
    async signOut() {
      await signOut(auth);
    },
  };
}

async function toAppUser(user: User): Promise<AppUser> {
  const { claims } = await user.getIdTokenResult();
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
