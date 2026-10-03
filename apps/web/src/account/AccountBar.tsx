import { useState } from 'react';
import { signInWithGoogleKeepingWork, type AppUser } from '@codetochip/data';
import { useServices } from '../services.tsx';

export function AccountBar({ user }: { user: AppUser | null | undefined }) {
  const services = useServices();
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | { error: string }>('idle');

  if (user === undefined) return null;
  const signedIn = user && !user.isAnonymous;
  const label = user?.isAnonymous ? 'Sign in to keep your work' : 'Sign in';

  const google = async () => {
    setState('idle');
    try {
      await signInWithGoogleKeepingWork(services);
      setOpen(false);
    } catch {
      setState({
        error:
          'Sign-in didn’t finish. If a popup was blocked, allow popups for this site and try again.',
      });
    }
  };

  const sendLink = async () => {
    setState('sending');
    try {
      await services.auth.sendEmailLink(email.trim(), location.href);
      setState('sent');
    } catch {
      setState({
        error: 'Couldn’t send the email. Check the address and your connection, then try again.',
      });
    }
  };

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
    <div className="relative flex items-center gap-3 text-sm">
      {user?.isAnonymous && (
        <span className="hidden text-muted sm:inline">Guest · work saved on this device</span>
      )}
      <button
        aria-label={label}
        aria-expanded={open}
        className="rounded-md bg-accent px-3 py-1.5 font-medium whitespace-nowrap text-on-accent"
        onClick={() => setOpen((o) => !o)}
      >
        <span aria-hidden className="sm:hidden">
          Sign in
        </span>
        <span aria-hidden className="hidden sm:inline">
          {label}
        </span>
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Sign in"
          className="absolute top-full right-0 z-20 mt-2 w-72 rounded-lg border border-line-strong bg-panel p-3 shadow-lg"
        >
          <button
            className="w-full rounded-md bg-white px-3 py-2 font-medium text-[#14171c]"
            onClick={() => void google()}
          >
            Continue with Google
          </button>
          <p className="my-3 text-center text-xs text-muted">or get a sign-in link by email</p>
          {state === 'sent' ? (
            <p role="status" className="text-ink">
              Check your email for a sign-in link. It may take a minute, and may land in spam.
            </p>
          ) : (
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void sendLink();
              }}
            >
              <input
                type="email"
                required
                aria-label="Email address"
                placeholder="you@example.com"
                className="min-w-0 flex-1 rounded bg-raised-2 px-2 py-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <button
                className="rounded bg-raised-2 px-3 py-1.5 disabled:opacity-40"
                disabled={state === 'sending' || !email.includes('@')}
              >
                Send
              </button>
            </form>
          )}
          {typeof state === 'object' && (
            <p role="alert" className="mt-2 text-err-ink">
              {state.error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
