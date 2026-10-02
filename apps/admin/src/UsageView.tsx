import { useEffect, useState } from 'react';
import type { FirebaseApp } from 'firebase/app';
import {
  collection,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { COLLECTIONS } from '@codetochip/data';
import { rates, topErrors, type EventRow, type RateRow } from './usage.ts';

const DAYS = 7;
const MAX_EVENTS = 5000;

/** Admin-only: compile and upload success rates from anonymous telemetry. */
export function UsageView({ app }: { app: FirebaseApp }) {
  const [events, setEvents] = useState<EventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const since = Timestamp.fromMillis(Date.now() - DAYS * 24 * 3600 * 1000);
    getDocs(
      query(
        collection(getFirestore(app), COLLECTIONS.telemetry),
        where('at', '>=', since),
        orderBy('at', 'desc'),
        limit(MAX_EVENTS),
      ),
    ).then(
      (snap) => !cancelled && setEvents(snap.docs.map((d) => d.data() as EventRow)),
      (e: Error) => !cancelled && setError(e.message),
    );
    return () => {
      cancelled = true;
    };
  }, [app]);

  if (error) return <p className="p-6 text-red-600">{error}</p>;
  if (!events) return <p className="p-6 opacity-70">Loading…</p>;
  const compiles = events.filter((e) => e.kind === 'compile');
  const flashes = events.filter((e) => e.kind === 'flash');

  return (
    <div className="mx-auto w-full max-w-4xl space-y-8 p-6">
      <div>
        <h1 className="text-xl font-semibold">Usage (last {DAYS} days)</h1>
        <p className="text-sm opacity-70">
          Anonymous events from people who didn’t opt out. {events.length.toLocaleString()} events
          {events.length >= MAX_EVENTS ? ' (showing the most recent)' : ''}.
        </p>
      </div>
      <Rates title="Compiles by board" rows={rates(compiles, (e) => e.board)} />
      <Rates
        title="Uploads by board and connection"
        rows={rates(flashes, (e) => `${e.board} · ${e.transport ?? '?'}`)}
      />
      <Rates
        title="Uploads by system and browser"
        rows={rates(flashes, (e) => `${e.os} · ${e.browser}`)}
      />
      <section>
        <h2 className="font-medium">Most common upload failures</h2>
        <ul className="mt-2 text-sm">
          {topErrors(flashes).map((t) => (
            <li key={t.error}>
              {t.error}: {t.count}
            </li>
          ))}
          {!flashes.some((e) => !e.ok) && <li className="opacity-70">None.</li>}
        </ul>
      </section>
    </div>
  );
}

function Rates({ title, rows }: { title: string; rows: RateRow[] }) {
  return (
    <section>
      <h2 className="font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-1 text-sm opacity-70">No data yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="text-left opacity-70">
              <th className="py-1"></th>
              <th>Attempts</th>
              <th>Succeeded</th>
              <th>Median time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.key} className="border-t border-gray-200 dark:border-gray-700">
                <td className="py-1.5">{r.key}</td>
                <td>{r.attempts}</td>
                <td className={r.rate < 0.8 ? 'text-red-600' : ''}>{Math.round(r.rate * 100)}%</td>
                <td>{(r.medianMs / 1000).toFixed(1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
