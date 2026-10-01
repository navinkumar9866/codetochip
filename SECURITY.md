# Security policy

CodeToChip compiles untrusted user code on shared servers, so we take sandbox escapes, data access bugs and auth bypasses seriously.

**Please do not open public issues for security problems.** Report them privately through GitHub's "Report a vulnerability" (Security tab → Advisories). Include steps to reproduce and the impact you observed.

In scope:

- the compile sandbox (`services/compiler`)
- Firestore/Storage security rules (`firebase/`)
- auth and role handling
- the web and admin apps
