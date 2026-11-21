import path from 'node:path';
import { createIncome, createTrade } from '@b3pt/core';
import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrate } from '../../src/adapters/postgres/migrate.js';
import { createPool } from '../../src/adapters/postgres/pool.js';
import { PostgresIncomeRepository, PostgresTradeRepository } from '../../src/adapters/postgres/repositories.js';

const url = process.env.TEST_DATABASE_URL;
const migrationsDir = path.resolve(import.meta.dirname, '../../../../db/migrations/postgres');

describe.skipIf(!url)('Postgres adapters (integração)', () => {
  let pool: pg.Pool;

  beforeAll(async () => {
    pool = createPool(url!, 2);
    await pool.query('DROP TABLE IF EXISTS trades, income_events, schema_migrations');
    const applied = await migrate(pool, migrationsDir, () => undefined);
    expect(applied).toEqual(['001_init.sql']);
    // Idempotente: segunda execução não reaplica.
    expect(await migrate(pool, migrationsDir, () => undefined)).toEqual([]);
  });

  afterAll(async () => {
    await pool?.end();
  });

  it('persiste e lê operação preservando decimais e data', async () => {
    const repo = new PostgresTradeRepository(pool);
    const t = createTrade({
      id: '22222222-2222-4222-8222-222222222222',
      ticker: 'PETR4',
      assetClass: 'STOCK',
      side: 'BUY',
      quantity: 3,
      unitPrice: '38.12345678',
      fees: '0.03',
      tradeDate: '2026-01-02',
      broker: 'XP',
    });
    await repo.save(t);
    await repo.save(t); // upsert idempotente
    const all = await repo.findAll();
    expect(all).toHaveLength(1);
    expect(all[0]!.unitPrice.toFixed(8)).toBe('38.12345678');
    expect(all[0]!.tradeDate).toBe('2026-01-02');
    expect(await repo.delete(t.id)).toBe(true);
    expect(await repo.delete(t.id)).toBe(false);
  });

  it('constraints do banco barram dado inválido mesmo fora do domínio', async () => {
    await expect(
      pool.query(
        `INSERT INTO trades (id, ticker, asset_class, side, quantity, unit_price, trade_date)
         VALUES (gen_random_uuid(), 'petr4', 'STOCK', 'BUY', 1, 10, '2026-01-02')`,
      ),
    ).rejects.toThrow(/check constraint/);
  });

  it('persiste proventos', async () => {
    const repo = new PostgresIncomeRepository(pool);
    await repo.save(
      createIncome({
        id: '33333333-3333-4333-8333-333333333333',
        ticker: 'ITUB4',
        type: 'JCP',
        grossAmount: '12.34',
        paymentDate: '2026-05-02',
      }),
    );
    const [e] = await repo.findAll();
    expect(e!.grossAmount.toFixed(2)).toBe('12.34');
    expect(e!.paymentDate).toBe('2026-05-02');
  });
});
