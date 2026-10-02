// Bundles the functions into functions/dist with a minimal package.json, so Cloud Build's
// `npm install` only sees the runtime dependencies (no pnpm workspace: links).
import { build } from 'esbuild';
import { existsSync, mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const external = ['firebase-admin', 'firebase-functions'];

mkdirSync(new URL('../dist/', import.meta.url), { recursive: true });
await build({
  entryPoints: [new URL('../src/index.ts', import.meta.url).pathname],
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  outfile: new URL('../dist/index.js', import.meta.url).pathname,
  external,
});
writeFileSync(
  new URL('../dist/package.json', import.meta.url),
  JSON.stringify(
    {
      name: 'codetochip-functions',
      private: true,
      type: 'module',
      main: 'index.js',
      engines: pkg.engines,
      dependencies: Object.fromEntries(external.map((d) => [d, pkg.dependencies[d]])),
    },
    null,
    2,
  ) + '\n',
);
// The local emulator loads functions from dist/ and needs the SDK there; reuse this package's
// node_modules. `firebase deploy` never uploads node_modules (Cloud Build installs them).
const modules = new URL('../dist/node_modules', import.meta.url);
if (!existsSync(modules)) symlinkSync('../node_modules', modules, 'dir');
console.log('functions/dist ready');
