# CodeToChip

Write code, flash any microcontroller, from any device.

Project rules: [`.claude/CLAUDE.md`](.claude/CLAUDE.md). Roadmap: [`docs/PLAN.md`](docs/PLAN.md).

## Layout

| Path                     | What                                                                                      |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| `apps/web`               | Vite + React PWA: editor, flashing UI, serial monitor, accounts                           |
| `apps/admin`             | Staff admin (FireCMS): examples, lessons, pages, site settings, users                     |
| `services/compiler`      | Fastify compile API (queue and sandboxed workers arrive in Phase 2)                       |
| `packages/flasher`       | Transports, bootloader protocols, USB-serial bridge drivers. No React, no DOM             |
| `packages/boards`        | Board manifests. The only place board-specific facts may live                             |
| `packages/data`          | Data model and backend services (auth, projects). Firebase implementation in `./firebase` |
| `packages/test-fixtures` | Recorded bootloader transcripts and the mock serial device                                |
| `firebase/`              | Firestore/Storage security rules, their emulator tests, seed and set-role scripts         |
| `docs/`                  | Plan, decisions (ADRs), hardware test matrix                                              |

## Getting started

Needs Node 22+ (see `.nvmrc`), pnpm (`corepack enable`) and Java 21+ for the Firebase emulators. No Google account or Firebase project is needed for local development.

```sh
pnpm install
pnpm dev          # emulators + web :5173 + admin :5174 + compile API :3001
pnpm seed         # second terminal: demo content + test users (admin, editor, student)
```

| Command                                        | Does                                                                                         |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm test`                                    | Vitest across all packages                                                                   |
| `pnpm test:rules`                              | Security rules and data layer against the Firebase emulators                                 |
| `pnpm test:e2e`                                | Playwright (run `pnpm --filter @codetochip/web exec playwright install chromium` once first) |
| `pnpm set-role <email> <role>`                 | Give a user `student`, `teacher`, `editor` or `admin`                                        |
| `pnpm lint` / `pnpm typecheck` / `pnpm format` | Checks and formatting                                                                        |
| `docker compose up`                            | Redis + compile API + compile worker (run `pnpm worker:build` first)                         |
| `pnpm worker:build` / `pnpm fixtures:compile`  | Build the toolchain image from the manifests / compile test sketches                         |

Emulator UI: http://localhost:4000. See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.

## Deploying (maintainers with access to the `codetochip` Firebase project)

```sh
pnpm deploy:rules       # Firestore + Storage security rules and indexes
pnpm deploy:functions   # Cloud Functions (builds functions/dist first)
```

These use the repo's own firebase-tools (on your Node), not a globally installed `firebase`
binary: the standalone binary bundles an older Node that can't run the pnpm build step.
Run `pnpm test:rules` before deploying rules.

## Adding a package

Create `packages/<name>/` with a `package.json` named `@codetochip/<name>` whose `exports` point at `./src/index.ts`, and a `tsconfig.json` extending `../../tsconfig.base.json`. Tests go in `test/*.test.ts` and are picked up by the root Vitest run automatically. Depend on it with `pnpm --filter <consumer> add '@codetochip/<name>@workspace:*'`.

## Licence

[Apache License 2.0](LICENSE). Security issues: see [SECURITY.md](SECURITY.md).
