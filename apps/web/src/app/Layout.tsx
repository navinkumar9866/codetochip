import { useState } from 'react';
import { Link, NavLink, Outlet } from 'react-router';
import { LayoutGrid } from 'lucide-react';
import { detectTransport } from '@codetochip/flasher';
import { AccountBar } from '../account/AccountBar.tsx';
import { EmailLinkHandler } from '../account/EmailLinkHandler.tsx';
import { useCurrentUser } from '../services.tsx';
import { Logo } from '../ui/Logo.tsx';
import { SettingsMenu } from './SettingsMenu.tsx';
import { TopBarContext } from './top-bar.tsx';

export function Layout() {
  const user = useCurrentUser();
  const support = detectTransport();
  const [start, setStart] = useState<HTMLElement | null>(null);
  const [modes, setModes] = useState<HTMLElement | null>(null);
  const [end, setEnd] = useState<HTMLElement | null>(null);
  const nav = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-1.5 rounded-sm px-1.5 py-1 text-sm font-medium hover:bg-raised-2 ${isActive ? 'text-ink' : 'text-muted'}`;
  return (
    <TopBarContext.Provider value={{ start, modes, end }}>
      <div className="flex min-h-dvh flex-col bg-ground text-ink">
        <header className="flex flex-none flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-line px-4 py-2.5 md:px-5">
          <Link to="/" aria-label="CodeToChip">
            <Logo />
          </Link>
          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5">
            <NavLink to="/projects" className={nav}>
              <LayoutGrid size={16} aria-hidden />
              Projects
            </NavLink>
            <div ref={setStart} className="contents" />
          </nav>
          <div ref={setModes} className="contents" />
          <div className="flex-1" />
          <nav aria-label="Main" className="flex items-center gap-1">
            <NavLink to="/classes" className={nav}>
              Classes
            </NavLink>
            <NavLink to="/help" className={nav}>
              Help
            </NavLink>
          </nav>
          <div ref={setEnd} className="contents" />
          <div className="flex items-center gap-3">
            <SettingsMenu />
            <AccountBar user={user} />
          </div>
        </header>
        {support.kind === 'unsupported' && (
          <p role="note" className="bg-warn-soft px-4 py-2 text-sm text-ink">
            {support.reason}{' '}
            <Link to="/help" className="text-accent-ink underline">
              Help
            </Link>
          </p>
        )}
        <EmailLinkHandler />
        <main className="flex min-h-0 flex-1 flex-col">
          <Outlet />
        </main>
      </div>
    </TopBarContext.Provider>
  );
}
