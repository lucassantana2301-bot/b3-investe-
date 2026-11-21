import { z } from 'zod';

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    HOST: z.string().default('0.0.0.0'),
    PORT: z.coerce.number().int().min(1).max(65535).default(3333),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DB_DRIVER: z.enum(['postgres', 'access', 'memory']).default('postgres'),
    DATABASE_URL: z.string().url().optional(),
    PG_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
    /** Ex.: Driver={Microsoft Access Driver (*.mdb, *.accdb)};Dbq=C:\\dados\\portfolio.accdb; */
    ACCESS_CONNECTION_STRING: z.string().optional(),

    BRAPI_BASE_URL: z.string().url().default('https://brapi.dev/api'),
    BRAPI_TOKEN: z.string().optional(),
    QUOTE_CACHE_TTL_SECONDS: z.coerce.number().int().min(0).default(60),
    BCB_BASE_URL: z.string().url().default('https://api.bcb.gov.br'),
    HTTP_TIMEOUT_MS: z.coerce.number().int().min(500).max(60_000).default(5000),

    API_KEY: z.string().optional(),
    CORS_ORIGIN: z.string().default('http://localhost:5173'),
    RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  })
  .superRefine((env, ctx) => {
    if (env.DB_DRIVER === 'postgres' && !env.DATABASE_URL) {
      ctx.addIssue({ code: 'custom', path: ['DATABASE_URL'], message: 'obrigatório com DB_DRIVER=postgres' });
    }
    if (env.DB_DRIVER === 'access' && !env.ACCESS_CONNECTION_STRING) {
      ctx.addIssue({ code: 'custom', path: ['ACCESS_CONNECTION_STRING'], message: 'obrigatório com DB_DRIVER=access' });
    }
    // Dados financeiros pessoais: em produção a API nunca sobe aberta.
    if (env.NODE_ENV === 'production' && (!env.API_KEY || env.API_KEY.length < 32)) {
      ctx.addIssue({ code: 'custom', path: ['API_KEY'], message: 'obrigatório em produção, mínimo de 32 caracteres' });
    }
    if (env.NODE_ENV === 'production' && env.DB_DRIVER === 'memory') {
      ctx.addIssue({ code: 'custom', path: ['DB_DRIVER'], message: 'memory não persiste dados; não use em produção' });
    }
  });

export type AppConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuração inválida:\n${issues}`);
  }
  return parsed.data;
}
