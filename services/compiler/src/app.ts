import Fastify, {
  type FastifyReply,
  type FastifyRequest,
  type FastifyServerOptions,
} from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { boards } from '@codetochip/boards';
import type { VerifyUser } from './auth.ts';
import type { CompileService } from './service.ts';
import { validateCompileRequest } from './validate.ts';

export interface AppOptions extends FastifyServerOptions {
  /** Compile requests per user (or per IP without sign-in) per minute (docs/PLAN.md 2.3). */
  compilesPerMinute?: number;
  /**
   * Sites allowed to call the API from the browser when it runs on its own domain (ADR 0005).
   * Empty means same-origin only (local dev proxies /api through Vite).
   */
  allowedOrigins?: string[];
  /** When set, only signed-in users may compile (the hosted site). Unset in local dev. */
  verifyUser?: VerifyUser;
  /** Refuse new compiles while this many are already waiting, so a flood can't pile up. */
  maxQueued?: number;
}

const BUSY = 'The compile server is very busy. Try again in a minute.';
const SIGN_IN = 'Sign in to compile and upload your code. It’s free: use Google or your email.';

/** Builds the app without listening, so tests can use `app.inject()`. */
export function buildApp(service: CompileService, opts: AppOptions = {}) {
  const {
    compilesPerMinute = 30,
    allowedOrigins = [],
    verifyUser,
    maxQueued,
    ...fastifyOpts
  } = opts;
  const users = new WeakMap<FastifyRequest, string>();
  // Sources are capped at 256 KB; leave room for JSON escaping.
  const app = Fastify({ bodyLimit: 1024 * 1024, ...fastifyOpts });

  if (allowedOrigins.length) void app.register(cors, { origin: allowedOrigins });
  void app.register(rateLimit, { global: false });
  // Routes go in a plugin registered after rate-limit, so its per-route hook is installed first.
  void app.register(async (app) => {
    app.get('/health', () => ({ ok: true }));

    app.get('/api/boards', () => boards);

    // Shared by both ways of compiling: sign-in, then a per-user limit.
    const guarded = {
      config: {
        rateLimit: {
          max: compilesPerMinute,
          timeWindow: '1 minute',
          // After sign-in is checked, so each user has their own limit (a class shares one IP).
          hook: 'preHandler' as const,
          keyGenerator: (req: FastifyRequest) => users.get(req) ?? req.ip,
          errorResponseBuilder: () => ({
            statusCode: 429,
            error: 'You’re compiling very often. Wait a minute, then try again.',
          }),
        },
      },
      preValidation: async (req: FastifyRequest, reply: FastifyReply) => {
        if (!verifyUser) return;
        const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
        const user = token ? await verifyUser(token) : null;
        if (!user) return reply.code(401).send({ error: SIGN_IN });
        users.set(req, user.uid);
      },
    };
    const tooBusy = async () => maxQueued !== undefined && (await service.waiting()) >= maxQueued;

    // Queue a job, then poll GET /api/compile/:id (one server or a shared Redis queue).
    app.post('/api/compile', guarded, async (req, reply) => {
      const v = validateCompileRequest(req.body);
      if (!v.ok) return reply.code(400).send({ error: v.error });
      if (await tooBusy()) return reply.code(503).send({ error: BUSY });
      const { id, position, cached } = await service.submit(v.job);
      return reply.code(202).send({ jobId: id, position, cached });
    });

    // Compile and answer on the same request, with the .bin inline (Cloud Run, ADR 0005).
    app.post('/api/build', guarded, async (req, reply) => {
      const v = validateCompileRequest(req.body);
      if (!v.ok) return reply.code(400).send({ error: v.error });
      if (await tooBusy()) return reply.code(503).send({ error: BUSY });
      try {
        const { outcome, binary } = await service.compile(v.job);
        const { artifact, ...rest } = outcome;
        return {
          ...rest,
          ...(artifact &&
            binary && {
              artifact: {
                size: artifact.size,
                sha256: artifact.sha256,
                base64: Buffer.from(binary).toString('base64'),
              },
            }),
        };
      } catch (e) {
        return reply.code(503).send({ error: (e as Error).message });
      }
    });

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
