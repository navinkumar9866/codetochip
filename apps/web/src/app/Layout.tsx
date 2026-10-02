import { Link, NavLink, Outlet } from 'react-router';
import { detectTransport } from '@codetochip/flasher';
import { AccountBar } from '../account/AccountBar.tsx';
import { EmailLinkHandler } from '../account/EmailLinkHandler.tsx';
import { useCurrentUser } from '../services.tsx';

export function Layout() {
  const user = useCurrentUser();
  const support = detectTransport();
  const nav = ({ isActive }: { isActive: boolean }) =>
    `px-2 py-1 text-sm ${isActive ? 'text-white' : 'text-slate-400 hover:text-white'}`;
  return (
    <div className="flex min-h-dvh flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-800 px-3 py-2">
        <Link to="/" className="font-semibold">
          CodeToChip
        </Link>
        <nav className="flex gap-1">
          <NavLink to="/" end className={nav}>
            Home
          </NavLink>
          <NavLink to="/classes" className={nav}>
            Classes
          </NavLink>
          <NavLink to="/help" className={nav}>
            Help
          </NavLink>
        </nav>
        <div className="ml-auto">
          <AccountBar user={user} />
        </div>
      </header>
      {support.kind === 'unsupported' && (
        <p role="note" className="bg-amber-950 px-4 py-2 text-sm text-amber-200">
          {support.reason}{' '}
          <Link to="/help" className="underline">
            Help
          </Link>
        </p>
      )}
      <EmailLinkHandler />
      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>
    </div>
  );
}
