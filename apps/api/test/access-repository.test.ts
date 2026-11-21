import { createTrade } from '@b3pt/core';
import { describe, expect, it } from 'vitest';
import type { OdbcClient, OdbcParam } from '../src/adapters/access/odbc-client.js';
import { AccessTradeRepository, accessDateToIso } from '../src/adapters/access/repositories.js';

/** Fake ODBC: grava o SQL emitido e devolve linhas no formato que o driver do Access produz. */
class FakeOdbc implements OdbcClient {
  readonly calls: Array<{ sql: string; params: readonly OdbcParam[] }> = [];
  constructor(private readonly responder: (sql: string) => object[]) {}
  async query<T extends object>(sql: string, params: readonly OdbcParam[] = []): Promise<T[]> {
    this.calls.push({ sql, params });
    return this.responder(sql) as T[];
  }
  async close(): Promise<void> {}
}

const trade = createTrade({
  id: '11111111-1111-4111-8111-111111111111',
  ticker: 'HGLG11',
  assetClass: 'FII',
  side: 'BUY',
  quantity: 10,
  unitPrice: '160.55',
  fees: '1.2',
  tradeDate: '2026-04-01',
});

describe('AccessTradeRepository', () => {
  it('faz INSERT quando o id não existe e usa parâmetros posicionais', async () => {
    const db = new FakeOdbc((sql) => (sql.startsWith('SELECT COUNT') ? [{ n: 0 }] : []));
    await new AccessTradeRepository(db).save(trade);
    const insert = db.calls.find((c) => c.sql.startsWith('INSERT'))!;
    expect(insert.sql).toContain('[asset_class]');
    expect(insert.params).toEqual([trade.id, 'HGLG11', 'FII', 'BUY', 10, '160.55', '1.20', '2026-04-01', null]);
  });

  it('faz UPDATE quando o id já existe', async () => {
    const db = new FakeOdbc((sql) => (sql.startsWith('SELECT COUNT') ? [{ n: '1' }] : []));
    await new AccessTradeRepository(db).save(trade);
    expect(db.calls.some((c) => c.sql.startsWith('UPDATE trades'))).toBe(true);
    expect(db.calls.some((c) => c.sql.startsWith('INSERT'))).toBe(false);
  });

  it('converte DATETIME e DECIMAL do Access de volta para o domínio', async () => {
    const db = new FakeOdbc(() => [
      {
        id: trade.id,
        ticker: 'HGLG11',
        asset_class: 'FII',
        side: 'BUY',
        quantity: 10,
        unit_price: '160,55',
        fees: 1.2,
        trade_date: '2026-04-01 00:00:00',
        broker: null,
      },
    ]);
    const [loaded] = await new AccessTradeRepository(db).findAll();
    expect(loaded!.tradeDate).toBe('2026-04-01');
    expect(loaded!.unitPrice.toFixed(2)).toBe('160.55');
    expect(loaded!.fees.toFixed(2)).toBe('1.20');
  });

  it('normaliza datas em Date sem deslocar o dia', () => {
    expect(accessDateToIso(new Date(2026, 3, 1, 0, 0, 0))).toBe('2026-04-01');
    expect(() => accessDateToIso('ontem')).toThrow();
  });
});
