import { buildApp } from './app.ts';
import { firebaseVerifier } from './auth.ts';
import { createRuntime } from './runtime.ts';

const port = Number(process.env.PORT ?? 3001);
const host = process.env.HOST ?? '127.0.0.1';
// "api", "worker" or "all". With Redis, run API and workers as separate processes in production.
const role = process.env.ROLE ?? 'all';

const runtime = createRuntime();
if (!runtime.distributed && role !== 'all') {
  console.error('ROLE=api/worker needs REDIS_URL so the processes can share a queue.');
  process.exit(1);
}

if (role === 'worker' || role === 'all') {
  runtime.startWorker();
  console.log(`compile worker started (concurrency ${runtime.concurrency})`);
}

if (role === 'api' || role === 'all') {
  const app = buildApp(runtime.service, {
    logger: true,
    // Behind the HTTPS proxy on the compile VM, so rate limits see the student's IP, not Caddy's.
    trustProxy: process.env.TRUST_PROXY === '1',
    allowedOrigins: (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean),
    // Set on the hosted server: only users signed in to this Firebase project may compile.
    ...(process.env.FIREBASE_PROJECT_ID && {
      verifyUser: firebaseVerifier(process.env.FIREBASE_PROJECT_ID),
    }),
    ...(process.env.MAX_QUEUED && { maxQueued: Number(process.env.MAX_QUEUED) }),
    ...(process.env.COMPILES_PER_MINUTE && {
      compilesPerMinute: Number(process.env.COMPILES_PER_MINUTE),
    }),
  });
  try {
    await app.listen({ port, host });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
  const shutdown = async () => {
    await app.close();
    await runtime.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
