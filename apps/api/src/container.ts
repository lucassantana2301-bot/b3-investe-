import { randomUUID } from 'node:crypto';
import {
  type IncomeRepository,
  type IsoDate,
  type TradeRepository,
  InMemoryIncomeRepository,
  InMemoryTradeRepository,
  PortfolioService,
} from '@b3pt/core';
import { AccessIncomeRepository, AccessTradeRepository } from './adapters/access/repositories.js';
import { createOdbcClient } from './adapters/access/odbc-client.js';
import { BcbBenchmarkProvider } from './adapters/bcb-benchmark-provider.js';
import { BrapiQuoteProvider } from './adapters/brapi-quote-provider.js';
import { defaultMigrationsDir, migrate } from './adapters/postgres/migrate.js';
import { createPool } from './adapters/postgres/pool.js';
import { PostgresIncomeRepository, PostgresTradeRepository } from './adapters/postgres/repositories.js';
import type { AppConfig } from './config.js';

export interface Container {
  service: PortfolioService;
  readiness: () => Promise<void>;
  dispose: () => Promise<void>;
}

interface Persistence {
  trades: TradeRepository;
  incomes: IncomeRepository;
  readiness: () => Promise<void>;
  dispose: () => Promise<void>;
}

/** Data de hoje em São Paulo: a B3 opera no horário de Brasília. */
export function todayInSaoPaulo(now = new Date()): IsoDate {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(now) as IsoDate;
}

async function createPersistence(config: AppConfig, log: (msg: string) => void): Promise<Persistence> {
  switch (config.DB_DRIVER) {
    case 'postgres': {
      const pool = createPool(config.DATABASE_URL!, config.PG_POOL_MAX);
      await migrate(pool, defaultMigrationsDir(), log);
      return {
        trades: new PostgresTradeRepository(pool),
        incomes: new PostgresIncomeRepository(pool),
        readiness: async () => {
          await pool.query('SELECT 1');
        },
        dispose: () => pool.end(),
      };
    }
    case 'access': {
      const db = await createOdbcClient(config.ACCESS_CONNECTION_STRING!);
      return {
        trades: new AccessTradeRepository(db),
        incomes: new AccessIncomeRepository(db),
        readiness: async () => {
          await db.query('SELECT COUNT(*) AS n FROM trades');
        },
        dispose: () => db.close(),
      };
    }
    case 'memory':
      return {
        trades: new InMemoryTradeRepository(),
        incomes: new InMemoryIncomeRepository(),
        readiness: async () => undefined,
        dispose: async () => undefined,
      };
  }
}

/** Composition root: único lugar que conhece as implementações concretas. */
export async function createContainer(
  config: AppConfig,
  logger: { info: (msg: string) => void; warn: (obj: object, msg: string) => void },
): Promise<Container> {
  const persistence = await createPersistence(config, (msg) => logger.info(msg));

  const quotes = new BrapiQuoteProvider({
    baseUrl: config.BRAPI_BASE_URL,
    token: config.BRAPI_TOKEN,
    timeoutMs: config.HTTP_TIMEOUT_MS,
    cacheTtlMs: config.QUOTE_CACHE_TTL_SECONDS * 1000,
    onError: (ticker, error) => logger.warn({ ticker, err: (error as Error).message }, 'cotação indisponível'),
  });
  const benchmark = new BcbBenchmarkProvider({
    baseUrl: config.BCB_BASE_URL,
    timeoutMs: config.HTTP_TIMEOUT_MS,
    cacheTtlMs: 6 * 60 * 60 * 1000,
  });

  const service = new PortfolioService({
    trades: persistence.trades,
    incomes: persistence.incomes,
    quotes,
    benchmark,
    clock: { today: () => todayInSaoPaulo() },
    ids: { next: () => randomUUID() },
    onProviderError: (provider, error) =>
      logger.warn({ provider, err: (error as Error).message }, 'provider externo falhou'),
  });

  return { service, readiness: persistence.readiness, dispose: persistence.dispose };
}
