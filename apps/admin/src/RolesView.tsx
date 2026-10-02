import { useCallback, useEffect, useState } from 'react';
import type { FirebaseApp } from 'firebase/app';
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions';
import { ROLES, type Role } from '@codetochip/data';

interface Row {
  uid: string;
  name: string;
  email: string;
  role: Role;
}

const FUNCTIONS_PORT = 5001;

/** Callable errors carry a code; server-side messages are already worded for people. */
function explain(e: unknown): string {
  const code = (e as { code?: string }).code ?? '';
  if (code === 'functions/internal' || code === 'functions/unavailable') {
    return 'Couldn’t reach the server. Check your connection and try again.';
  }
  // The SDK appends the HTTP status (" [400]"); people don't need it.
  return (e instanceof Error ? e.message : String(e)).replace(/\s*\[\d{3}\]$/, '');
}

/** Admin-only: list users and change their role (via the setUserRole Cloud Function). */
export function RolesView({
  app,
  emulatorHost,
}: {
  app: FirebaseApp;
  emulatorHost: string | null;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [message, setMessage] = useState<{ error: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  const callable = useCallback(
    <In, Out>(name: string) => {
      const functions = getFunctions(app, 'asia-south1');
      if (emulatorHost) connectFunctionsEmulator(functions, emulatorHost, FUNCTIONS_PORT);
      return httpsCallable<In, Out>(functions, name);
    },
    [app, emulatorHost],
  );

  const load = useCallback(async (): Promise<Row[]> => {
    type Listed = { uid: string; name: string | null; email: string | null; role: Role }[];
    const { data } = await callable<void, Listed>('listUsers')();
    return data.map((u) => ({
      uid: u.uid,
      name: u.name ?? u.email ?? u.uid,
      email: u.email ?? '',
      role: u.role,
    }));
  }, [callable]);

  useEffect(() => {
    let cancelled = false;
    load().then(
      (r) => !cancelled && setRows(r),
      (e: unknown) => !cancelled && setMessage({ error: true, text: explain(e) }),
    );
    return () => {
      cancelled = true;
    };
  }, [load]);

  const change = async (row: Row, role: Role) => {
    setSaving(row.uid);
    setMessage(null);
    try {
      await callable<{ uid: string; role: Role }, unknown>('setUserRole')({ uid: row.uid, role });
      setRows(await load());
      setMessage({
        error: false,
        text: `${row.name} is now ${role}. It takes effect the next time they sign in (at most an hour).`,
      });
    } catch (e) {
      setMessage({ error: true, text: explain(e) });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl p-6">
      <h1 className="text-xl font-semibold">Roles</h1>
      <p className="mt-1 text-sm opacity-70">
        Teachers can create classes. Editors manage content. Admins manage everything, including
        roles.
      </p>
      {message && (
        <p
          role={message.error ? 'alert' : 'status'}
          className={`mt-3 text-sm ${message.error ? 'text-red-600' : 'text-green-700'}`}
        >
          {message.text}
        </p>
      )}
      {!rows ? (
        <p className="mt-4 text-sm opacity-70">Loading…</p>
      ) : (
        <table className="mt-4 w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="py-1">Name</th>
              <th>Email</th>
              <th>Role</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.uid} className="border-t border-gray-200 dark:border-gray-700">
                <td className="py-2">{r.name}</td>
                <td>{r.email}</td>
                <td>
                  <select
                    aria-label={`Role for ${r.name}`}
                    value={r.role}
                    disabled={saving === r.uid}
                    onChange={(e) => void change(r, e.target.value as Role)}
                    className="rounded border px-2 py-1"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
