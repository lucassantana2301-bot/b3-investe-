import { timingSafeEqual } from 'node:crypto';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { DomainError, type PortfolioService } from '@b3pt/core';
import Fastify, { type FastifyError, type FastifyInstance, type FastifyServerOptions } from 'fastify';
import { ZodError } from 'zod';
import { registerRoutes } from './routes.js';

export interface AppOptions {
  service: PortfolioService;
  apiKey: string | undefined;
  corsOrigins: string[];
  rateLimitPerMinute: number;
  logger: NonNullable<FastifyServerOptions['logger']>;
  /** Checagem de dependências para o readiness probe. */
  readiness?: () => Promise<void>;
}

const STATUS_BY_CODE: Record<DomainError['code'], number> = {
  INVALID_TICKER: 422,
  INVALID_QUANTITY: 422,
  INVALID_PRICE: 422,
  INVALID_DATE: 422,
  INVALID_AMOUNT: 422,
  INVALID_CNPJ: 422,
  INSUFFICIENT_POSITION: 409,
  ASSET_CLASS_CONFLICT: 409,
  NOT_FOUND: 404,
};

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger,
    bodyLimit: 64 * 1024,
    // Request id para correlacionar logs entre API, analytics e front.
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(helmet);
  await app.register(cors, { origin: opts.corsOrigins, methods: ['GET', 'POST', 'DELETE'] });
  await app.register(rateLimit, { max: opts.rateLimitPerMinute, timeWindow: '1 minute' });

  app.addHook('onRequest', async (request, reply) => {
    // Preflight de CORS não carrega Authorization.
    if (!opts.apiKey || request.method === 'OPTIONS' || request.url.startsWith('/health')) return;
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : '';
    if (!safeEqual(token, opts.apiKey)) {
      return reply.code(401).send({ error: 'UNAUTHORIZED', message: 'API key ausente ou inválida' });
    }
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof DomainError) {
      return reply
        .code(STATUS_BY_CODE[error.code])
        .send({ error: error.code, message: error.message, details: error.details });
    }
    if (error instanceof ZodError) {
      return reply.code(400).send({
        error: 'VALIDATION_ERROR',
        message: 'Requisição inválida',
        details: error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    const statusCode = 'statusCode' in error ? error.statusCode : undefined;
    if (statusCode && statusCode < 500) {
      return reply.code(statusCode).send({ error: 'BAD_REQUEST', message: error.message });
    }
    // Nunca expõe stack/mensagem interna (pode conter SQL ou connection string).
    request.log.error({ err: error }, 'erro não tratado');
    return reply.code(500).send({ error: 'INTERNAL_ERROR', message: 'Erro interno', requestId: request.id });
  });

  app.get('/health/live', async () => ({ status: 'ok' }));
  app.get('/health/ready', async (_request, reply) => {
    try {
      await opts.readiness?.();
      return { status: 'ready' };
    } catch (error) {
      app.log.warn({ err: error }, 'readiness falhou');
      return reply.code(503).send({ status: 'unavailable' });
    }
  });

  await app.register(registerRoutes(opts.service), { prefix: '/api/v1' });
  return app;
}
