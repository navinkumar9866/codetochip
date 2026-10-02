// Compiles every sketch in packages/test-fixtures/sketches for every flash mode of every
// board, in the real sandbox, into packages/test-fixtures/build/<board>-<mode>/<sketch>.bin
// (git-ignored: the binaries contain LGPL core code). Used by the /spike/flash page.
//   pnpm fixtures:compile
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boards } from '@codetochip/boards';
import { ArduinoCliAdapter, defaultSandbox } from '../src/toolchains/arduino-cli.ts';
import { validateCompileRequest } from '../src/validate.ts';

const root = fileURLToPath(new URL('../../../packages/test-fixtures/', import.meta.url));
const adapter = new ArduinoCliAdapter(defaultSandbox);
let failed = 0;

for (const board of boards.filter((b) => b.toolchain.kind === 'arduino-cli')) {
  for (const mode of board.flash.modes) {
    const outDir = `${root}build/${board.id}-${mode.id}/`;
    mkdirSync(outDir, { recursive: true });
    for (const sketch of readdirSync(`${root}sketches`)) {
      const dir = `${root}sketches/${sketch}/`;
      const files = readdirSync(dir).map((path) => ({
        path,
        content: readFileSync(dir + path, 'utf8'),
      }));
      const v = validateCompileRequest({ board: board.id, mode: mode.id, files });
      if (!v.ok) throw new Error(`${sketch}: ${v.error}`);
      const r = await adapter.compile(v.job);
      if (!r.ok) {
        failed++;
        console.error(`${board.id}-${mode.id}/${sketch}: FAILED\n${r.log}`);
        continue;
      }
      writeFileSync(`${outDir}${sketch}.bin`, r.binary!);
      console.log(
        `${board.id}-${mode.id}/${sketch}.bin  ${r.binary!.length} bytes  ${(r.durationMs / 1000).toFixed(1)}s`,
      );
    }
  }
}
process.exit(failed ? 1 : 0);
