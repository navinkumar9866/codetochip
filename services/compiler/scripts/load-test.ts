// N students press Compile at the same moment (docs/PLAN.md 2 acceptance: 60 without errors).
//   COMPILES_PER_MINUTE=1000 docker compose up -d   (lift the per-IP limit for one machine)
//   pnpm --filter @codetochip/compiler load-test [N] [base-url]
import { boards } from '@codetochip/boards';

// Any arduino-cli board from the registry; the load test isn't about a particular board.
const board = boards.find((b) => b.toolchain.kind === 'arduino-cli')!;
const mode = board.flash.modes[0]!.id;
const n = Number(process.argv[2] ?? 60);
const base = process.argv[3] ?? 'http://localhost:3001';
const sketch = (i: number) =>
  `// student ${i} ${Math.random()}\nvoid setup() { Serial.begin(115200); }\nvoid loop() { Serial.println(${i}); delay(1000); }\n`;

type Status = {
  state: string;
  position?: number;
  outcome?: { ok: boolean; durationMs: number };
  error?: string;
};

async function student(i: number) {
  const t0 = Date.now();
  const res = await fetch(`${base}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      board: board.id,
      mode,
      files: [{ path: 'sketch.ino', content: sketch(i) }],
    }),
  });
  if (res.status !== 202)
    return { i, ok: false, error: `HTTP ${res.status}: ${await res.text()}`, ms: Date.now() - t0 };
  const { jobId, position } = (await res.json()) as { jobId: string; position: number };
  for (;;) {
    await new Promise((r) => setTimeout(r, 500));
    const s = (await (await fetch(`${base}/api/compile/${jobId}`)).json()) as Status;
    if (s.state === 'succeeded' || s.state === 'failed') {
      return {
        i,
        ok: s.state === 'succeeded' && !!s.outcome?.ok,
        error: s.error,
        position,
        ms: Date.now() - t0,
        compileMs: s.outcome?.durationMs,
      };
    }
  }
}

const started = Date.now();
const results = await Promise.all(Array.from({ length: n }, (_, i) => student(i)));
const ms = results.map((r) => r.ms).sort((a, b) => a - b);
const pct = (p: number) =>
  (ms[Math.min(ms.length - 1, Math.floor((p / 100) * ms.length))]! / 1000).toFixed(1);
const failures = results.filter((r) => !r.ok);
console.log(
  `${n} compiles in ${((Date.now() - started) / 1000).toFixed(1)} s; failures: ${failures.length}`,
);
console.log(`wait until result: p50 ${pct(50)} s, p90 ${pct(90)} s, max ${pct(100)} s`);
const compile = results
  .map((r) => r.compileMs ?? 0)
  .filter(Boolean)
  .sort((a, b) => a - b);
console.log(
  `compile time per job: median ${(compile[Math.floor(compile.length / 2)]! / 1000).toFixed(1)} s`,
);
for (const f of failures.slice(0, 5)) console.log('failure', f);
process.exit(failures.length ? 1 : 0);
