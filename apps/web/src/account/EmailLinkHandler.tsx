import { useEffect, useState } from 'react';
import { useLocation } from 'react-router';
import { signInKeepingWork } from '@codetochip/data';
import { useServices } from '../services.tsx';

const LINK_PARAMS = ['apiKey', 'oobCode', 'mode', 'lang', 'continueUrl', 'emailLink'];
const looksLikeSignInLink = (url: URL) =>
  url.searchParams.has('oobCode') || url.searchParams.has('emailLink');

/** Finishes email-link sign-in when the user arrives from the link in their email. */
export function EmailLinkHandler() {
  const services = useServices();
  const { search } = useLocation();
  const [needEmail, setNeedEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);

  const finish = async (address?: string) => {
    const href = location.href;
    try {
      await signInKeepingWork(services, () => services.auth.completeEmailLink(href, address));
      const clean = new URL(href);
      for (const p of LINK_PARAMS) clean.searchParams.delete(p);
      history.replaceState(history.state, '', clean.pathname + clean.search + clean.hash);
      setNeedEmail(false);
      setMessage({ error: false, text: 'You’re signed in.' });
    } catch (e) {
      const text = e instanceof Error ? e.message : String(e);
      if (/email address the link was sent to/.test(text)) setNeedEmail(true);
      else
        setMessage({
          error: true,
          text: 'This sign-in link has expired or was already used. Ask for a new one.',
        });
    }
  };

  useEffect(() => {
    if (!looksLikeSignInLink(new URL(location.href))) return;
    const t = setTimeout(() => void finish(), 0);
    return () => clearTimeout(t);
    // Runs whenever the URL becomes a sign-in link (page load or in-app navigation).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  if (needEmail) {
    return (
      <form
        className="flex flex-wrap items-center gap-2 bg-panel px-4 py-2 text-sm"
        onSubmit={(e) => {
          e.preventDefault();
          void finish(email.trim());
        }}
      >
        <span>Confirm the email address you used to get this link:</span>
        <input
          type="email"
          required
          aria-label="Email address for sign-in"
          className="rounded bg-raised-2 px-2 py-1"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button className="rounded bg-accent px-3 py-1 text-on-accent">Sign in</button>
      </form>
    );
  }
  if (!message) return null;
  return (
    <p
      role={message.error ? 'alert' : 'status'}
      className={`px-4 py-2 text-sm ${message.error ? 'bg-err-soft text-err-ink' : 'bg-ok-soft text-ok-ink'}`}
    >
      {message.text}
    </p>
  );
}
