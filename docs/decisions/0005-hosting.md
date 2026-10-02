# 0005 — Hosting

Date: 2026-10-02 · Status: **proposed** (needs Navin's decision before the first deployment)

## What has to run

| Piece                                           | Built as                                            | Hosting needs                                                              |
| ----------------------------------------------- | --------------------------------------------------- | -------------------------------------------------------------------------- |
| Web app, admin                                  | Static PWA builds                                   | CDN, HTTPS, India-friendly latency                                         |
| Accounts, projects, classes, content, telemetry | Firebase (ADR 0001)                                 | Firebase project, `asia-south1`                                            |
| Cloud Functions (roles)                         | `functions/`                                        | Firebase Functions, `asia-south1` (Blaze plan)                             |
| Compile API                                     | `services/compiler` `ROLE=api`                      | Small stateless container + Redis                                          |
| Compile workers                                 | `services/compiler` `ROLE=worker` + toolchain image | **x86-64**; starts one locked-down container per job; gVisor in production |

Two things decide the workers' home:

- **The VEGA toolchain only runs on x86-64** (ADR 0003).
- **Workers need the Docker socket,** which is root on that machine (ADR 0004). They must not share a machine with anything else.

## Options for the compile workers

### A. Dedicated VMs (Compute Engine managed instance group) — recommended to start

x86 VMs in Mumbai running Docker with gVisor (`runsc`) and the worker container, which is exactly what we built and tested. The API runs on Cloud Run, Redis on Memorystore, and the web and admin on Firebase Hosting.

- **Pros:**
  - Same design as tested (fresh container per job, no network, read-only, gVisor).
  - Warm image cache, so ~2 s compiles.
  - Easy to reason about isolation: nothing else runs on the worker VMs.
- **Cons:**
  - We patch the OS (or use Container-Optimized OS).
  - Autoscaling is coarser (VM level).
  - We pay for idle VMs.

### B. Cloud Run service with concurrency 1

The worker image itself serves compiles; Cloud Run's sandbox (gVisor-based in the first-generation environment) isolates instances.

- **Pros:** no VMs to manage, and scales to zero.
- **Cons:**
  - Instances are **reused** between requests, so one student's files could be seen by the next unless we wipe everything per job. That's weaker than a fresh container.
  - We can't set a read-only root or our own seccomp profile.
  - Egress can only be blocked through VPC firewall rules.
  - Cold starts with a 669 MB image.

### C. GKE Autopilot with GKE Sandbox (gVisor), one pod per job

- **Pros:** strongest managed isolation (fresh sandboxed pod per job), no socket, and fine-grained scaling.
- **Cons:**
  - Pod start adds seconds to every compile unless we keep a pool.
  - More moving parts (Kubernetes) for a small team.

## Recommendation

Start with **A**: a managed instance group of 2 small x86 VMs in `asia-south1`, with gVisor and the worker container. Add VMs to the group for classroom peaks (ADR 0004 sizing: ~8 s worst-case wait for 60 students needs ~16 parallel compiles). Move to **C** if we outgrow manual scaling or want per-job pods without the socket.

Everything else: Firebase Hosting for web and admin, Cloud Run for the compile API, Memorystore for Redis, and Firebase (Auth, Firestore, Functions) in `asia-south1`.

**Costs:** see ADR 0001 for the Firebase side. Get VM, Memorystore and Cloud Run prices for `asia-south1` from the Google Cloud pricing calculator before deciding; I haven't verified current list prices.

## Before the first deployment (Navin)

- [ ] Create the Firebase project (Blaze plan, `asia-south1`). Enable Google and Email-link sign-in.
- [ ] Choose a worker hosting option (A/B/C).
- [ ] Confirm redistribution terms with C-DAC (open question 6). The worker image contains the VEGA core.
- [ ] Domain name.
