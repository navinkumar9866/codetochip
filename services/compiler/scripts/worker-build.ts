// Builds the arduino-cli worker image with every core and board variant from the manifests,
// so no board names live in the Dockerfile (CLAUDE.md rule 6).
//   pnpm worker:build
//   tsx scripts/worker-build.ts --print-args   (one docker argument per line, for Cloud Build)
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { boards, fqbnFor } from '@codetochip/boards';
import { defaultSandbox } from '../src/toolchains/arduino-cli.ts';

const arduino = boards.filter((b) => b.toolchain.kind === 'arduino-cli');
const unique = (xs: string[]) => [...new Set(xs)].join(' ');
const args = {
  BOARD_INDEX_URLS: unique(arduino.map((b) => b.toolchain.indexUrl)),
  CORES: unique(arduino.map((b) => `${b.toolchain.core}@${b.toolchain.coreVersion}`)),
  PREBUILD_FQBNS: unique(arduino.flatMap((b) => b.flash.modes.map((m) => fqbnFor(b, m.id)))),
};
const buildArgs = Object.entries(args).flatMap(([k, v]) => ['--build-arg', `${k}=${v}`]);
if (process.argv.includes('--print-args')) {
  console.log(buildArgs.join('\n'));
  process.exit(0);
}
console.log(args);

const context = fileURLToPath(new URL('../workers/arduino-cli', import.meta.url));
const r = spawnSync(
  'docker',
  [
    'build',
    '--platform',
    'linux/amd64',
    '-t',
    process.env.WORKER_IMAGE ?? defaultSandbox.image,
    ...buildArgs,
    context,
  ],
  { stdio: 'inherit' },
);
process.exit(r.status ?? 1);
