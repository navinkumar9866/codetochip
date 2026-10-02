# 0004 — Compile service design

Date: 2026-10-02 · Status: accepted (Phase 2)

## Decision

`services/compiler` is a Fastify API plus workers, connected by a job queue.

```
POST /api/compile → validate → result cache? → queue (BullMQ/Redis) → worker
GET  /api/compile/:id   (state, queue position, diagnostics, artifact URL)
GET  /api/artifacts/:id (.bin, expires after 1 hour)
GET  /api/boards
```

- **Interfaces with two implementations each.** The queue, artifact store and result cache each have a Redis version (production; API and workers can run as separate processes) and an in-memory version (tests, and local development without Redis). The choice is made by `REDIS_URL`.
- **One sandboxed container per job, through a `ToolchainAdapter`** (`arduino-cli` first).
  - Sources go in as a tar on stdin. The `.bin` comes back as base64 on stdout, and compiler output on stderr. No host path is mounted.
  - Sandbox flags live in one place, `sandboxArgs()`, and the Docker tests probe that exact configuration.
- **Validation before queueing.** The checks are:
  - File limits shared with saved projects (`packages/data`).
  - Exactly one top-level `.ino`, and no duplicate names.
  - No `#include` of absolute, parent-directory or home paths, and no `.incbin`.
  - The validator is a usability guard. The sandbox is the security boundary: a macro-built `#include` can only ever see the container's own files, and a Docker test proves it.
- **Result cache** keyed by SHA-256 of (toolchain, FQBN including mode options, core version, sources).
  - Successes and genuine compile errors are cached for 1 hour. Timeouts and crashes are not.
  - Cached results return immediately with a `c_<hash>` id.
- **Random, unguessable job and artifact ids**, because results contain users' code diagnostics.
- **Rate limit:** 30 compiles per IP per minute (`COMPILES_PER_MINUTE`), with a message that says to wait.
- **The worker image is built from the manifests.** `pnpm worker:build` passes cores, index URLs and every board variant's FQBN, so the Dockerfile names no boards.

## Measurements (2026-10-02)

Measured on an Apple Silicon Mac with Docker Desktop, so x86-64 is emulated; native servers should be faster.

| Check                                                                                   | Result                                                                                                                |
| --------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Blink, end to end through the compose stack (API → Redis → worker → sandbox → download) | **2.2 s** (compile 1.95 s); `.bin` byte-identical to the fixture build                                                |
| Rebuilt image vs the image that ran on real ARIES at Gate 0 (hello-serial)              | **Byte-identical**                                                                                                    |
| 60 simultaneous compiles, one worker with concurrency 4                                 | **0 failures**; all done in 32.3 s; wait p50 15.4 s, p90 29.2 s; ~2.0 s per compile                                   |
| Sandbox probes                                                                          | Runs as uid 10001; no network or DNS; root FS and toolchain read-only; 64 MB tmpfs cap; fork bomb contained in < 30 s |

**Classroom sizing:** the last of N simultaneous students waits about N × 2 s ÷ (parallel compiles).

- With 60 students and 4 parallel compiles, that's ~30 s.
- With 16 parallel compiles across x86 workers, it's ~8 s.
- **A warm container pool is deferred.** Container start is most of the ~2 s, and that's already within the "< 5 s" target.

## Consequences and risks

- **Docker socket = root on the host.** The worker starts sandbox containers through the host's Docker daemon (`/var/run/docker.sock` in `docker-compose.yml`). In production, workers must run on **dedicated hosts** with gVisor (`SANDBOX_RUNTIME=runsc`) and no other workloads, or move to an orchestrator that launches jobs without socket access. Decide with hosting in Phase 5.
- **gVisor still needs verification.** It's not available on Docker Desktop; verify on a Linux host before launch.
- **Memory limit still to re-measure.** 1 GB per job, because 512 MB OOM-killed a full core build under emulation (ADR 0003). Sketch-only builds need far less; re-measure on native x86.
- **One image for all arduino-cli cores.** Fine for one board family. Revisit (one image per core family) when the image grows large (Phase 7).
- **Tests that need real infrastructure** run separately:
  - `pnpm --filter @codetochip/compiler test:docker` (needs Docker + the worker image)
  - `test:redis` (needs `REDIS_TEST_URL`)
  - `load-test`

  They skip themselves in the normal `pnpm test`.
