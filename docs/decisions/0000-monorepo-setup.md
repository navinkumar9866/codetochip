# 0000 — Monorepo setup

Date: 2026-10-01 · Status: accepted

## Decisions

- **pnpm workspaces, no Turborepo/Nx yet.** `pnpm -r` is enough at this size. Add a task runner with caching when CI time hurts.
- **Internal packages export TypeScript source** (`"exports": "./src/index.ts"`). Vite, Vitest and tsx compile them on the fly, so there is no build step between packages. If a package is ever published to npm, give it a real build then.
- **One shared `tsconfig.base.json`, typecheck-only (`noEmit`).** Strict mode plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`, because protocol code indexes byte arrays constantly.
- **TypeScript pinned to 6.0.x.** TypeScript 7 is out, but typescript-eslint 8.71 supports only `<6.1`. Upgrade when it does.
- **Architecture rules enforced by ESLint** (`eslint.config.js`):
  - Board names and USB IDs are banned as string literals in `apps/` and `services/` (CLAUDE.md rule 6).
  - `packages/flasher` may not use `window`, `document`, storage or React (CLAUDE.md rule 5).
- **Compiler API runs under `tsx`** in dev and in its Docker image for now. Revisit bundling when hosting is decided (Phase 5).
- **One root Vitest run** covers everything: a jsdom project for `apps/web` and a node project for `packages/*` and `services/*`.
