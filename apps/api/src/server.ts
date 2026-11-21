import { loadConfig } from './config.js';
import { createContainer } from './container.js';
import { buildApp } from './http/app.js';

async function main(): Promise<void> {
  const config = loadConfig();

  const bootLogger = {
    info: (msg: string) => console.log(JSON.stringify({ level: 'info', msg })),
    warn: (obj: object, msg: string) => console.warn(JSON.stringify({ level: 'warn', msg, ...obj })),
  };
  const container = await createContainer(config, bootLogger);

  const server = await buildApp({
    service: container.service,
    apiKey: config.API_KEY,
    corsOrigins: config.CORS_ORIGIN.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    rateLimitPerMinute: config.RATE_LIMIT_PER_MINUTE,
    // Nunca logar credenciais.
    logger: { level: config.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    readiness: container.readiness,
  });

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    server.log.info({ signal }, 'encerrando');
    try {
      await server.close();
      await container.dispose();
      process.exit(0);
    } catch (error) {
      server.log.error({ err: error }, 'falha ao encerrar');
      process.exit(1);
    }
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await server.listen({ host: config.HOST, port: config.PORT });
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
