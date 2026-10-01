import Fastify, { type FastifyServerOptions } from 'fastify';
import { boards } from '@codetochip/boards';

/** Builds the app without listening, so tests can use `app.inject()`. */
export function buildApp(opts: FastifyServerOptions = {}) {
  const app = Fastify(opts);

  app.get('/health', () => ({ ok: true }));

  app.get('/api/boards', () => boards);

  return app;
}
