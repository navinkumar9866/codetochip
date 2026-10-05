import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ArrowRight, Eye, EyeOff, X } from 'lucide-react';
import {
  AuthError,
  MIN_PASSWORD_LENGTH,
  SignInCancelledError,
  signInKeepingWork,
  signInWithGoogleKeepingWork,
} from '@codetochip/data';
import { useServices } from '../services.tsx';

export type SignInMode = 'login' | 'signup' | 'reset';

type Status = 'idle' | 'busy' | 'sent' | { error: string };

const TRY_AGAIN = 'Something went wrong. Check your connection and try again.';

/** The sign-in box: log in, sign up, or reset a password. Google or email and password. */
export function SignInDialog({
  initialMode = 'login',
  onClose,
}: {
  initialMode?: SignInMode;
  onClose: () => void;
}) {
  const services = useServices();
  const [mode, setMode] = useState<SignInMode>(initialMode);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const switchTo = (m: SignInMode) => {
    setMode(m);
    setStatus('idle');
  };

  // Escape closes; Tab stays inside the box; focus returns to where it was.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key !== 'Tab' || !panel.current) return;
      const items = panel.current.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input, a[href]',
      );
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      before?.focus();
    };
  }, [onClose]);

  useEffect(() => {
    panel.current?.querySelector<HTMLElement>('input')?.focus();
  }, [mode]);

  const run = async (action: () => Promise<unknown>, after: () => void) => {
    setStatus('busy');
    try {
      await action();
      after();
    } catch (e) {
      if (e instanceof SignInCancelledError) setStatus('idle');
      else setStatus({ error: e instanceof AuthError ? e.message : TRY_AGAIN });
    }
  };

  const google = () =>
    run(
      () =>
        signInWithGoogleKeepingWork(services).catch((e: unknown) => {
          if (e instanceof AuthError) throw e;
          throw new AuthError(
            'Google sign-in didn’t finish. Check your connection and try again, or use email.',
          );
        }),
      onClose,
    );

  const submit = () => {
    const address = email.trim();
    if (mode === 'login') {
      void run(
        () =>
          signInKeepingWork(services, () => services.auth.signInWithPassword(address, password)),
        onClose,
      );
    } else if (mode === 'signup') {
      void run(
        () =>
          signInKeepingWork(services, () =>
            services.auth.createAccount({ name, email: address, password }),
          ),
        onClose,
      );
    } else {
      void run(
        () => services.auth.sendPasswordReset(address),
        () => setStatus('sent'),
      );
    }
  };

  const busy = status === 'busy';
  const text = {
    login: {
      title: 'Log in to CodeToChip',
      lede: 'Pick up where you left off — your projects are saved to your account.',
      button: 'Log in',
    },
    signup: {
      title: 'Create your account',
      lede: 'It’s free. Save your projects, compile in the cloud and join your class.',
      button: 'Create account',
    },
    reset: {
      title: 'Reset your password',
      lede: 'Enter the email you signed up with. We’ll send a link to choose a new password.',
      button: 'Send reset link',
    },
  }[mode];

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgb(32_30_29/0.5)] px-4 py-4 sm:py-10"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="w-full max-w-[600px] rounded-md border-2 border-line-strong bg-panel font-sans text-ink shadow-[0_24px_60px_rgb(0_0_0/0.25)]"
      >
        <div className="flex items-center justify-between border-b-2 border-line-strong px-6 py-5 sm:px-10 sm:py-7">
          <span className="text-[13px] font-bold tracking-[0.08em] text-accent-ink uppercase">
            {mode === 'reset' ? 'Forgot password' : 'Sign in'}
          </span>
          <button
            aria-label="Close"
            className="-m-2 p-2 text-accent-ink hover:text-accent"
            onClick={onClose}
          >
            <X size={20} aria-hidden />
          </button>
        </div>

        {mode !== 'reset' && (
          <div role="tablist" className="grid grid-cols-2 border-b-2 border-line-strong">
            {(
              [
                ['login', 'Log in'],
                ['signup', 'Sign up'],
              ] as const
            ).map(([m, label]) => (
              <button
                key={m}
                role="tab"
                aria-selected={mode === m}
                className={`px-6 pt-5 pb-4 text-left text-lg font-bold sm:px-10 ${
                  mode === m
                    ? 'text-ink shadow-[inset_0_-4px_0_var(--accent)]'
                    : 'text-muted hover:text-ink'
                }`}
                onClick={() => switchTo(m)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="px-6 py-7 sm:px-10 sm:py-9">
          <h2
            id={titleId}
            className="m-0 text-[28px] leading-tight font-extrabold tracking-[-0.02em] sm:text-[38px]"
          >
            {text.title}
          </h2>
          <p className="mt-3 mb-0 text-base leading-relaxed text-muted sm:text-lg">{text.lede}</p>

          {mode !== 'reset' && (
            <>
              <button
                className="mt-8 flex w-full items-center gap-3 rounded-md border border-line bg-panel px-5 py-4 text-base font-bold text-ink hover:bg-raised-2 disabled:opacity-50"
                disabled={busy}
                onClick={() => void google()}
              >
                <GoogleMark />
                Continue with Google
              </button>
              <div className="my-7 flex items-center gap-4 text-[13px] font-bold tracking-[0.08em] text-muted uppercase">
                <span className="h-0.5 flex-1 bg-line" />
                or with email
                <span className="h-0.5 flex-1 bg-line" />
              </div>
            </>
          )}

          {status === 'sent' ? (
            <p role="status" className="mt-8 rounded-md bg-ok-soft p-4 text-ink">
              If there’s an account for <strong>{email.trim()}</strong>, we’ve sent it a link to
              choose a new password. It may take a minute, and may land in spam.
            </p>
          ) : (
            <form
              className={`flex flex-col gap-6 ${mode === 'reset' ? 'mt-8' : ''}`}
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              {mode === 'signup' && (
                <Field label="Name" hint="Shown to your teacher and on shared projects.">
                  {(id) => (
                    <input
                      id={id}
                      autoComplete="name"
                      placeholder="Your name"
                      className={INPUT}
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  )}
                </Field>
              )}
              <Field label="Email">
                {(id) => (
                  <input
                    id={id}
                    type="email"
                    required
                    autoComplete="email"
                    placeholder="you@example.com"
                    className={INPUT}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                )}
              </Field>
              {mode !== 'reset' && (
                <Field
                  label="Password"
                  hint={
                    mode === 'signup' ? `At least ${MIN_PASSWORD_LENGTH} characters.` : undefined
                  }
                  extra={
                    mode === 'login' && (
                      <button
                        type="button"
                        className="text-[15px] font-semibold text-accent-ink underline underline-offset-4 hover:text-accent"
                        onClick={() => switchTo('reset')}
                      >
                        Forgot password?
                      </button>
                    )
                  }
                >
                  {(id) => (
                    <PasswordInput
                      id={id}
                      value={password}
                      onChange={setPassword}
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      minLength={mode === 'signup' ? MIN_PASSWORD_LENGTH : undefined}
                      placeholder={mode === 'signup' ? 'Choose a password' : 'Your password'}
                    />
                  )}
                </Field>
              )}
              {typeof status === 'object' && (
                <p role="alert" className="m-0 rounded-md bg-err-soft p-3 text-err-ink">
                  {status.error}
                </p>
              )}
              <button
                className="mt-2 flex w-full items-center justify-between rounded-md bg-accent px-5 py-4 text-lg font-extrabold text-on-accent hover:bg-accent-hover disabled:opacity-60"
                disabled={busy}
              >
                {busy ? 'Please wait…' : text.button}
                <ArrowRight size={20} aria-hidden />
              </button>
            </form>
          )}
        </div>

        <div className="border-t-2 border-line-strong px-6 py-5 text-base text-muted sm:px-10 sm:py-6">
          {mode === 'login' ? (
            <>
              New to CodeToChip?{' '}
              <FooterLink onClick={() => switchTo('signup')}>Create an account</FooterLink>
            </>
          ) : mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <FooterLink onClick={() => switchTo('login')}>Log in</FooterLink>
            </>
          ) : (
            <>
              Remembered it?{' '}
              <FooterLink onClick={() => switchTo('login')}>Back to log in</FooterLink>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const INPUT =
  'w-full rounded-md border-2 border-line-strong bg-panel px-4 py-3.5 text-lg text-ink placeholder:text-muted focus:border-accent focus:outline-none';

function Field({
  label,
  hint,
  extra,
  children,
}: {
  label: string;
  hint?: string | undefined;
  extra?: ReactNode;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-base font-bold">
          {label}
        </label>
        {extra}
      </div>
      {children(id)}
      {hint && <span className="text-sm text-muted">{hint}</span>}
    </div>
  );
}

function PasswordInput({
  id,
  value,
  onChange,
  ...rest
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  minLength?: number | undefined;
  placeholder: string;
}) {
  const [shown, setShown] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={shown ? 'text' : 'password'}
        required
        className={`${INPUT} pr-14`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...rest}
      />
      <button
        type="button"
        aria-label={shown ? 'Hide password' : 'Show password'}
        aria-pressed={shown}
        className="absolute inset-y-0 right-0 px-4 text-accent-ink hover:text-accent"
        onClick={() => setShown((s) => !s)}
      >
        {shown ? <EyeOff size={20} aria-hidden /> : <Eye size={20} aria-hidden />}
      </button>
    </div>
  );
}

function FooterLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      className="ml-1 font-bold text-accent-ink underline underline-offset-4 hover:text-accent"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function GoogleMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
      />
      <path
        fill="#FF3D00"
        d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
      />
    </svg>
  );
}
