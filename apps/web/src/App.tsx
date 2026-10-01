import { boards } from '@codetochip/boards';
import { AccountBar } from './account/AccountBar.tsx';
import { MyProjects } from './account/MyProjects.tsx';
import { useCurrentUser } from './services.tsx';

export function App() {
  const user = useCurrentUser();

  return (
    <main className="min-h-dvh bg-slate-950 px-4 py-8 text-slate-100">
      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">CodeToChip</h1>
          <p className="mt-1 text-slate-400">
            Write code, flash any microcontroller, from any device.
          </p>
        </div>
        <AccountBar user={user} />
      </header>

      {user && <MyProjects />}

      <h2 className="mt-8 text-sm font-medium tracking-wide text-slate-400 uppercase">Boards</h2>
      <ul className="mt-2 space-y-2">
        {boards.map((b) => (
          <li key={b.id} className="rounded-lg border border-slate-800 p-3">
            <div className="font-medium">{b.name}</div>
            <div className="text-sm text-slate-400">{b.vendor}</div>
          </li>
        ))}
      </ul>
    </main>
  );
}
