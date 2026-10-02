import { buildApp } from './app.ts';
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
