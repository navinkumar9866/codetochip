# Contributing to CodeToChip

Thanks for helping. Please read [`.claude/CLAUDE.md`](.claude/CLAUDE.md) for the architecture rules and [`docs/PLAN.md`](docs/PLAN.md) for the roadmap.

## Local setup

You do **not** need a Google account or Firebase project. Everything runs against the Firebase Emulator Suite.

Requirements:

- Node 22+ and pnpm (`corepack enable`)
- Java 21+ for the Firebase emulators (`brew install openjdk@21`, or your OS package)

```sh
pnpm install
pnpm dev     # emulators + web (:5173) + admin (:5174) + compile API (:3001)
pnpm seed    # in a second terminal: demo content and test users
```

The seeded users and their roles are printed by `pnpm seed`. Emulator UI: http://localhost:4000.

## Before opening a pull request

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm test:rules
```

- **Rules changes:** if you touch `firebase/*.rules`, add or update a test in `firebase/test/`.
- **Device behaviour:** if you touch device behaviour, add a recorded transcript or mock-transport test. Never guess device behaviour; see "Open questions" in `docs/PLAN.md`.
- **Ported code:** if you port third-party code, check that its licence is compatible with Apache-2.0 and credit it in the file header.

## Licence

By contributing, you agree that your contributions are licensed under the [Apache License 2.0](LICENSE).
