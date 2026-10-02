import Fastify, { type FastifyServerOptions } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { boards } from '@codetochip/boards';
import type { CompileService } from './service.ts';
import { validateCompileRequest } from './validate.ts';

export interface AppOptions extends FastifyServerOptions {
  /** Compile requests per IP per minute (docs/PLAN.md 2.3). */
  compilesPerMinute?: number;
}

/** Builds the app without listening, so tests can use `app.inject()`. */
export function buildApp(service: CompileService, opts: AppOptions = {}) {
  const { compilesPerMinute = 30, ...fastifyOpts } = opts;
  // Sources are capped at 256 KB; leave room for JSON escaping.
  const app = Fastify({ bodyLimit: 1024 * 1024, ...fastifyOpts });

  void app.register(rateLimit, { global: false });
  // Routes go in a plugin registered after rate-limit, so its per-route hook is installed first.
  void app.register(async (app) => {
    app.get('/health', () => ({ ok: true }));

    app.get('/api/boards', () => boards);

    app.post(
      '/api/compile',
      {
        config: {
          rateLimit: {
            max: compilesPerMinute,
            timeWindow: '1 minute',
            errorResponseBuilder: () => ({
              statusCode: 429,
              error: 'You’re compiling very often. Wait a minute, then try again.',
            }),
          },
        },
      },
      async (req, reply) => {
        const v = validateCompileRequest(req.body);
        if (!v.ok) return reply.code(400).send({ error: v.error });
        const { id, position, cached } = await service.submit(v.job);
        return reply.code(202).send({ jobId: id, position, cached });
      },
    );

    app.get<{ Params: { id: string } }>('/api/compile/:id', async (req, reply) => {
      const status = await service.status(req.params.id);
      if (!status) {
        return reply.code(404).send({ error: 'This compile result has expired. Compile again.' });
      }
      const outcome = status.outcome && {
        ...status.outcome,
        ...(status.outcome.artifact && {
          artifact: {
            ...status.outcome.artifact,
            url: `/api/artifacts/${status.outcome.artifact.id}`,
          },
        }),
      };
      return { ...status, ...(outcome && { outcome }) };
    });

    app.get<{ Params: { id: string } }>('/api/artifacts/:id', async (req, reply) => {
      const bytes = await service.artifact(req.params.id);
      if (!bytes) {
        return reply
          .code(404)
          .send({ error: 'This build has expired. Compile again to download it.' });
      }
      return reply
        .header('content-type', 'application/octet-stream')
        .header('content-disposition', 'attachment; filename="firmware.bin"')
        .header('cache-control', 'private, max-age=3600')
        .send(Buffer.from(bytes));
    });
  });

  return app;
}
