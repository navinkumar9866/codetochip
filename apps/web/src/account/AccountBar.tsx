import { useState } from 'react';
import { signInWithGoogleKeepingWork, type AppUser } from '@codetochip/data';
import { useServices } from '../services.tsx';

export function AccountBar({ user }: { user: AppUser | null | undefined }) {
  const services = useServices();
  const [error, setError] = useState<string | null>(null);

  if (user === undefined) return null;

  const signIn = async () => {
    setError(null);
    try {
      await signInWithGoogleKeepingWork(services);
    } catch {
      setError(
        'Sign-in didn’t finish. If a popup was blocked, allow popups for this site and try again.',
      );
    }
  };

  const signedIn = user && !user.isAnonymous;
  return (
    <div className="flex items-center gap-3 text-sm">
      {signedIn ? (
        <>
          <span className="text-slate-300">{user.displayName ?? user.email}</span>
          <button className="text-slate-400 underline" onClick={() => void services.auth.signOut()}>
            Sign out
          </button>
        </>
      ) : (
        <>
          {user?.isAnonymous && (
            <span className="hidden text-slate-400 sm:inline">
              Guest · work saved on this device
            </span>
          )}
          <button
            aria-label={user?.isAnonymous ? 'Sign in to keep your work' : 'Sign in with Google'}
            className="rounded-md bg-sky-600 px-3 py-1.5 font-medium whitespace-nowrap text-white"
            onClick={() => void signIn()}
          >
            <span aria-hidden className="sm:hidden">
              Sign in
            </span>
            <span aria-hidden className="hidden sm:inline">
              {user?.isAnonymous ? 'Sign in to keep your work' : 'Sign in with Google'}
            </span>
          </button>
        </>
      )}
      {error && (
        <p role="alert" className="max-w-60 text-red-400">
          {error}
        </p>
      )}
    </div>
  );
}
