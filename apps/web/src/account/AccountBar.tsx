import { useCallback, useEffect, useState } from 'react';
import type { AppUser } from '@codetochip/data';
import { useServices } from '../services.tsx';
import { SignInDialog, type SignInMode } from './SignInDialog.tsx';

const OPEN_SIGN_IN = 'c2c-open-sign-in';

/** Opens the sign-in box, e.g. from a "Sign in to compile" button. */
export function openSignIn(mode: SignInMode = 'login') {
  window.dispatchEvent(new CustomEvent(OPEN_SIGN_IN, { detail: mode }));
}

export function AccountBar({ user }: { user: AppUser | null | undefined }) {
  const services = useServices();
  const [open, setOpen] = useState<SignInMode | null>(null);
  const close = useCallback(() => setOpen(null), []);
  useEffect(() => {
    const show = (e: Event) => setOpen((e as CustomEvent<SignInMode>).detail ?? 'login');
    window.addEventListener(OPEN_SIGN_IN, show);
    return () => window.removeEventListener(OPEN_SIGN_IN, show);
  }, []);

  if (user === undefined) return null;
  const signedIn = user && !user.isAnonymous;
  const label = user?.isAnonymous ? 'Sign in to keep your work' : 'Sign in';

  if (signedIn) {
    return (
      <div className="flex items-center gap-3 text-sm">
        <span className="max-w-40 truncate text-ink">{user.displayName ?? user.email}</span>
        <button className="text-muted underline" onClick={() => void services.auth.signOut()}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 text-sm">
      {user?.isAnonymous && (
        <span className="hidden text-muted sm:inline">Guest · work saved on this device</span>
      )}
      <button
        aria-label={label}
        aria-haspopup="dialog"
        className="rounded-md bg-accent px-3 py-1.5 font-medium whitespace-nowrap text-on-accent"
        onClick={() => setOpen('login')}
      >
        <span aria-hidden className="sm:hidden">
          Sign in
        </span>
        <span aria-hidden className="hidden sm:inline">
          {label}
        </span>
      </button>
      {open && <SignInDialog initialMode={open} onClose={close} />}
    </div>
  );
}
