/** Aggregates anonymous telemetry events into success rates (pure, unit-tested). */
export interface EventRow {
  kind: 'compile' | 'flash';
  ok: boolean;
  board: string;
  os: string;
  browser: string;
  transport?: string;
  durationMs: number;
  error?: string;
}

export interface RateRow {
  key: string;
  attempts: number;
  succeeded: number;
  rate: number;
  medianMs: number;
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)]!;
};

/** Success rate per group, most attempts first. */
export function rates(events: EventRow[], group: (e: EventRow) => string): RateRow[] {
  const groups = new Map<string, EventRow[]>();
  for (const e of events) groups.set(group(e), [...(groups.get(group(e)) ?? []), e]);
  return [...groups]
    .map(([key, list]) => {
      const succeeded = list.filter((e) => e.ok).length;
      return {
        key,
        attempts: list.length,
        succeeded,
        rate: succeeded / list.length,
        medianMs: median(list.map((e) => e.durationMs)),
      };
    })
    .sort((a, b) => b.attempts - a.attempts || a.key.localeCompare(b.key));
}

/** Most common failure categories. */
export function topErrors(events: EventRow[], limit = 5): { error: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const e of events)
    if (!e.ok) counts.set(e.error ?? 'unknown', (counts.get(e.error ?? 'unknown') ?? 0) + 1);
  return [...counts]
    .map(([error, count]) => ({ error, count }))
    .sort((a, b) => b.count - a.count || a.error.localeCompare(b.error))
    .slice(0, limit);
}
