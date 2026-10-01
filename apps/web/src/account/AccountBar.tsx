import { useState } from 'react';
import type { AppUser } from '@codetochip/data';
import { useServices } from '../services.tsx';

export function AccountBar({ user }: { user: AppUser | null | undefined }) {
  const { auth } = useServices();
  const [error, setError] = useState<string | null>(null);

  if (user === undefined) return null;

  const signIn = async () => {
    setError(null);
    try {
      await auth.signInWithGoogle();
    } catch {
      setError(
        'Sign-in didn’t finish. If a popup was blocked, allow popups for this site and try again.',
      );
    }
  };

  return (
    <div className="text-right text-sm">
      {user ? (
        <>
          <div className="text-slate-300">{user.displayName ?? user.email}</div>
          <button className="text-slate-400 underline" onClick={() => void auth.signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <button
          className="rounded-md bg-sky-600 px-3 py-1.5 font-medium text-white"
          onClick={() => void signIn()}
        >
          Sign in with Google
        </button>
      )}
      {error && (
        <p role="alert" className="mt-2 max-w-60 text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
