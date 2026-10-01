# 0001 — Backend platform for accounts, saved code and admin

Date: 2026-10-01 · Status: accepted (Navin, 2026-10-01)

## Context

CodeToChip needs, from the desktop MVP (Phase 3) onwards:

- Sign-up and login, user accounts, saving users' code across devices.
- An admin area where staff add content (examples, lessons, pages, FAQ), manage users and roles, and manage site settings.

None of this is unique to CodeToChip, so we want a framework that provides it rather than building it ourselves. Engineering time should go to what is unique: the flasher, the compile sandbox and board support.

Options compared: **Firebase + FireCMS**, **Payload CMS** (Next.js + Postgres), and briefly Supabase and PocketBase.

### Open source, but not self-hosted

CodeToChip is open source under **Apache-2.0**. The code is public for contributions and transparency, and there is **one official hosted site**. Making the platform easy for schools or institutions to self-host is explicitly **not** a goal. That is why a proprietary hosted backend (Firebase) is acceptable.

If self-hosting becomes a goal later, switch to **Supabase**: it is open source, runs under `docker compose`, and keeps equivalent auth. `packages/data` is the seam that keeps that switch contained.

Consequences for contributors:

- **Everything runs locally with the Firebase Emulator Suite** under the `demo-codetochip` project id. No Google account or Firebase project is needed to contribute.
- **No secrets in the repo.** Firebase web config values are public identifiers, but production values still live in CI/hosting environment variables, not in git.

## Options at a glance

|                  | Firebase + FireCMS                                                                                                | Payload CMS                                                                                                                     |
| ---------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| What it is       | Google's hosted backend: Auth, Firestore (NoSQL), Storage, Hosting. FireCMS adds an admin/CMS on top of Firestore | Open-source TypeScript backend and CMS on Next.js. Generates database, APIs and admin UI from TypeScript collection definitions |
| Licence          | Proprietary hosted service. FireCMS Community is MIT                                                              | MIT, self-hosted                                                                                                                |
| Database         | Firestore (document/NoSQL)                                                                                        | Postgres (relational)                                                                                                           |
| Who runs servers | Google (except our compiler)                                                                                      | Us                                                                                                                              |
| Frontend impact  | Keep Vite + React PWA as is                                                                                       | `apps/web` becomes Next.js (public site + `/admin` + `/ide`)                                                                    |

## Pros and cons

### Firebase + FireCMS

**Pros**

- **Best login options out of the box:** Google, phone OTP, email magic link, email/password, and anonymous guests who can upgrade to a full account without losing work.
- **Almost no ops work:** no servers, databases, backups or patching for the account/data layer.
- **Offline saving built in:** the Firestore SDK caches data on the device and syncs when back online, which matches our PWA and classroom goals.
- **India region** (`asia-south1`, Mumbai) and a generous free tier, so the pilot costs close to nothing.
- **Good fit with our compiler:** Cloud Run can host it in the same Google Cloud project.
- **Common skill set:** many Indian developers already know Firebase, which helps with hiring.

**Cons**

- **NoSQL data model.** Saved projects fit naturally. Relational features (teachers → classes → students → submissions, reporting) need careful modelling and duplicated data.
- **Security lives in Firestore security rules,** which are easy to get wrong. They must be tested with the Firebase emulator in CI.
- **Vendor lock-in to Google.** Leaving later means migrating auth users and rewriting data access.
- **Usage-based pricing.** Firestore charges per read and write, and Auth charges per user above 50k MAU. Bad query design or a traffic spike shows up on the bill, so budget alerts are needed.
- **Admin for non-technical staff needs FireCMS.** Its free MIT Community edition covers content editing. **The user and role management screen is paid** (Cloud €9.99 per editor per month, or PRO €99+ per month self-hosted). Otherwise we build a small user/role screen ourselves.
- **Phone OTP is billed per SMS** at Google's rates, which can dominate the bill if phone login is the main method.

### Payload CMS

**Pros**

- **Best admin and content experience:** auto-generated admin, rich text, media library, drafts and versions, live preview, and field-level access control, all configured in TypeScript.
- **Relational Postgres:** classrooms, submissions, reporting and analytics queries are straightforward.
- **No lock-in:** MIT licence, standard Postgres, runs on any host.
- **One TypeScript codebase** for data models, access rules and admin.
- **Next.js gives server-rendered public pages,** which is better for SEO on landing pages and lessons.

**Cons**

- **We run it:** hosting, Postgres backups, upgrades, scaling and security patches. That needs part-time backend/DevOps ownership.
- **Login is narrower:** email/password is built in, Google sign-in needs a plugin, and phone OTP needs an SMS provider plus custom code.
- **No built-in offline sync:** saving code offline and syncing it later is custom work.
- **Heavier frontend framework:** we move from Vite to Next.js, and making the IDE work offline takes more setup.
- **Higher fixed monthly cost,** even with no users.

### Others considered

- **Supabase:** Postgres plus excellent auth (including phone OTP) and storage. Strong option, but its Studio is a developer tool, so we would build the staff-facing admin ourselves (e.g. with react-admin or Refine). Reconsider if relational data becomes central and we still want hosted auth.
- **PocketBase:** a single binary with auth and an admin UI. Great for prototypes, but it uses SQLite and runs on one server, so it doesn't scale to classroom bursts across India.
- **Django / Laravel:** very complete, but they add a second language to the codebase.

## Cost estimates (USD per month)

> **These are estimates, not quotes.** Free quotas below were checked on firebase.google.com/pricing and firecms.co/pricing on 2026-10-01. Per-unit Google Cloud prices (Firestore operations, Identity Platform MAU, Cloud Run, SMS) could not be fetched and are from earlier list prices; **re-check them in the Google Cloud pricing calculator before committing.**

### Assumptions

- **Firestore usage:** per monthly active user (MAU), about 300 document reads, 60 writes and 1 MB stored per month.
- **Compile usage:** about 3 compiles per active user per week, ~5 s on 1 vCPU each, with classroom peaks around 10× the average.
- **SMS is shown separately** because it depends on how many users choose phone login. Ballpark: $0.01–0.05 per SMS via Firebase. Indian SMS gateways are usually cheaper but need TRAI DLT registration.

### Free quotas that matter (Firebase Blaze plan)

| Service   | Free quota                                                |
| --------- | --------------------------------------------------------- |
| Auth      | 50k MAU; then ~$0.0055 per MAU (Identity Platform tier 1) |
| Firestore | 50k reads/day, 20k writes/day, 1 GiB stored               |
| Storage   | 5 GB                                                      |
| Hosting   | 10 GB stored, 360 MB/day transfer                         |

### Scenarios

| Scenario                                            | Firebase + FireCMS                                                        | Payload (self-hosted)                                                  | Compiler (same for both)                   |
| --------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------ |
| **Pilot**, ~1k MAU                                  | ~$0 (within free tier)                                                    | $15–50 (small app host + small/free managed Postgres + object storage) | $20–40 (one small VM with Docker + gVisor) |
| **Growth**, ~20k MAU                                | $5–15                                                                     | $110–210 (2 app instances, managed Postgres, CDN, email)               | $60–150                                    |
| **Scale**, ~100k MAU                                | $320–360 (≈$275 is Auth above 50k MAU; Firestore ≈$45; hosting ≈$10)      | $380–680 (HA Postgres, more instances, CDN, email)                     | $250–600 (warm pool for peaks)             |
| **Optional extras**                                 | FireCMS role-management UI: €10–30 for 1–3 editors, or build it ourselves | —                                                                      | —                                          |
| **SMS** (if 20% of users use phone OTP, 2 SMS each) | ~$4–20 / $80–400 / $400–2,000                                             | Similar, depending on the gateway                                      | —                                          |

**Totals, excluding SMS and people:**

| Scenario | Firebase + FireCMS | Payload     |
| -------- | ------------------ | ----------- |
| Pilot    | **~$20–40**        | ~$35–90     |
| Growth   | **~$65–165**       | ~$170–360   |
| Scale    | ~$570–960          | ~$630–1,280 |

At scale, Firebase's per-user Auth charge narrows the gap. Above roughly 200k MAU, Payload's cost can be lower, but only if someone is already paid to run it.

### People cost (usually larger than infrastructure)

|                                      | Firebase + FireCMS                                                                     | Payload                                                                 |
| ------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Backend/DevOps for accounts and data | Little: security rules and a few Cloud Functions, handled by a full-stack TS developer | ~0.25–0.5 FTE: Postgres backups, upgrades, scaling, patching, incidents |
| Compiler infrastructure              | Same for both (see below)                                                              | Same for both                                                           |

## What a framework covers vs. what we build

### Covered by the framework (configure, don't build)

| Area                                               | Firebase + FireCMS                                        | Payload                          |
| -------------------------------------------------- | --------------------------------------------------------- | -------------------------------- |
| Sign-up, login, password reset, email verification | Firebase Auth                                             | Payload auth                     |
| Google sign-in                                     | Firebase Auth                                             | Plugin                           |
| Phone OTP                                          | Firebase Auth                                             | **Custom** (SMS provider + code) |
| Guest users upgrading to accounts                  | Firebase anonymous auth                                   | **Custom**                       |
| Sessions and tokens                                | Firebase Auth                                             | Payload auth                     |
| Roles and permissions                              | Custom claims + security rules (small amount of our code) | Access control config            |
| Saving and loading projects                        | Firestore                                                 | Payload REST/Local API           |
| Offline save and sync                              | Firestore offline persistence                             | **Custom**                       |
| Content editing (examples, lessons, pages, FAQ)    | FireCMS                                                   | Payload admin                    |
| Media and image uploads                            | Firebase Storage + FireCMS                                | Payload uploads + S3 adapter     |
| User and role management screen                    | FireCMS Cloud/PRO (paid) or **small custom screen**       | Payload admin                    |
| Site settings and feature flags                    | Firestore doc in FireCMS, or Firebase Remote Config       | Payload globals                  |
| Product analytics                                  | Google Analytics for Firebase                             | Add a tool (e.g. PostHog)        |
| Hosting and CDN for the web app                    | Firebase Hosting                                          | Choose and configure a host      |

### Always custom (CodeToChip's core, whichever platform we pick)

| Area                          | What it is                                                                                               | Skill needed                       |
| ----------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| IDE                           | CodeMirror editor, files, compile errors inline, mobile layout                                           | Frontend (React)                   |
| Flasher                       | Web Serial/WebUSB transports, bootloader protocols, USB-serial bridge drivers (CP210x, CH34x, FTDI, CDC) | **Embedded + web**: rare, critical |
| Serial monitor                | Console over the same transports                                                                         | Frontend + embedded                |
| Board registry and onboarding | Manifests, schema, examples, hardware testing per board                                                  | Embedded                           |
| Compiler service              | API, job queue, sandboxed Docker/gVisor workers, toolchain images, caching                               | **Platform/DevOps + security**     |
| Classroom features            | Classes, assignments, submissions, teacher views                                                         | Full-stack                         |
| Telemetry dashboards          | Compile and flash success rates by board, OS and browser                                                 | Full-stack                         |
| Simulator (Phase 6)           | Rust → WASM RV32IM emulator and peripherals                                                              | Systems (Rust)                     |

## Maintenance staffing implied

| Role                            | Owns                                          | Firebase                    | Payload                                |
| ------------------------------- | --------------------------------------------- | --------------------------- | -------------------------------------- |
| Frontend developer (React/TS)   | IDE, public site, admin customisations        | Yes                         | Yes (plus Next.js)                     |
| Embedded/web-USB engineer       | Flasher, drivers, protocols, board onboarding | Yes                         | Yes                                    |
| Platform/DevOps engineer        | Compiler sandbox, workers, queue, cloud infra | Yes (part-time once stable) | Yes, **plus** Postgres and app hosting |
| Backend developer               | Data model, access rules, server functions    | Part of the full-stack role | Dedicated part-time                    |
| Content editors (non-technical) | Lessons, examples, pages, FAQ                 | Via FireCMS                 | Via Payload admin                      |

## Recommendation

**Firebase + FireCMS**, because the priorities are: don't re-engineer solved problems, minimal ops work for a small team, phone/Google login for students in India, offline-first use, and near-zero cost during the pilot.

To limit the downsides:

- **Keep all data access behind a small `packages/data` interface** so the app never calls Firebase directly from UI code. That keeps a future migration (e.g. to Supabase or Payload) contained.
- **Test security rules in CI** with the Firebase emulator, and set budget alerts from day one.
- **Make Google sign-in the default.** Offer phone OTP as an option, and revisit an Indian SMS gateway if SMS costs grow.
- **Start with FireCMS Community.** Pay for Cloud only when there's more than one editor, or build the small role-management screen ourselves.

**Revisit this decision if:**

- classroom and reporting features become the core product (relational data favours Postgres), or
- MAU passes ~200k and the per-user Auth cost outweighs the cost of running our own stack.
