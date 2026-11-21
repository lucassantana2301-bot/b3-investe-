import {
  type IsoDate,
  type Quote,
  type Ticker,
  InMemoryIncomeRepository,
  InMemoryTradeRepository,
  PortfolioService,
  dec,
} from '@b3pt/core';
import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/http/app.js';

const API_KEY = 'k'.repeat(40);
let app: FastifyInstance;

async function makeApp(apiKey?: string) {
  let n = 0;
  const service = new PortfolioService({
    trades: new InMemoryTradeRepository(),
    incomes: new InMemoryIncomeRepository(),
    quotes: {
      getQuotes: async (tickers) =>
        new Map<Ticker, Quote>(
          tickers.map((t) => [t, { ticker: t, price: dec('12'), changePercent: null, asOf: 'x' }]),
        ),
    },
    benchmark: { cdiFactor: async () => dec('1.05') },
    clock: { today: () => '2026-11-21' as IsoDate },
    ids: { next: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}` },
  });
  app = await buildApp({
    service,
    apiKey,
    corsOrigins: ['http://localhost:5173'],
    rateLimitPerMinute: 1000,
    logger: false,
  });
  return app;
}

const auth = { authorization: `Bearer ${API_KEY}` };
const buy = {
  ticker: 'ITSA4',
  assetClass: 'STOCK',
  side: 'BUY',
  quantity: 2000,
  unitPrice: '10',
  tradeDate: '2026-01-05',
};

afterEach(async () => {
  await app?.close();
});

describe('HTTP API', () => {
  it('exige API key quando configurada, exceto no health', async () => {
    await makeApp(API_KEY);
    expect((await app.inject({ method: 'GET', url: '/api/v1/trades' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/v1/trades', headers: { authorization: 'Bearer errada' } }))
        .statusCode,
    ).toBe(401);
    expect((await app.inject({ method: 'GET', url: '/api/v1/trades', headers: auth })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/health/live' })).statusCode).toBe(200);
  });

  it('cria operação, calcula carteira e apura IR', async () => {
    await makeApp();
    const created = await app.inject({ method: 'POST', url: '/api/v1/trades', payload: buy });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({ ticker: 'ITSA4', fees: '0.00' });

    await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      payload: { ...buy, side: 'SELL', unitPrice: '12', tradeDate: '2026-02-10' },
    });
    await app.inject({
      method: 'POST',
      url: '/api/v1/trades',
      payload: { ...buy, quantity: 100, tradeDate: '2026-03-02' },
    });

    const portfolio = (await app.inject({ method: 'GET', url: '/api/v1/portfolio' })).json();
    expect(portfolio.marketValue).toBe('1200.00');
    expect(portfolio.realizedResult).toBe('4000.00');
    expect(portfolio.cdiReturn).toBe('0.05');

    const tax = (await app.inject({ method: 'GET', url: '/api/v1/tax?year=2026' })).json();
    expect(tax).toHaveLength(1);
    expect(tax[0]).toMatchObject({ month: '2026-02', darfPayable: '598.80', darfCode: '6015' });
  });

  it('responde 400 para payload malformado e 422/409 para regra de negócio', async () => {
    await makeApp();
    const extra = await app.inject({ method: 'POST', url: '/api/v1/trades', payload: { ...buy, hack: true } });
    expect(extra.statusCode).toBe(400);
    expect(extra.json().error).toBe('VALIDATION_ERROR');

    const badTicker = await app.inject({ method: 'POST', url: '/api/v1/trades', payload: { ...buy, ticker: 'ABCDE' } });
    expect(badTicker.statusCode).toBe(422);

    const shortSell = await app.inject({ method: 'POST', url: '/api/v1/trades', payload: { ...buy, side: 'SELL' } });
    expect(shortSell.statusCode).toBe(409);
    expect(shortSell.json().error).toBe('INSUFFICIENT_POSITION');

    const notUuid = await app.inject({ method: 'DELETE', url: '/api/v1/trades/1' });
    expect(notUuid.statusCode).toBe(400);
  });

  it('registra proventos e resume retenção', async () => {
    await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/incomes',
      payload: { ticker: 'ITSA4', type: 'JCP', grossAmount: '100', paymentDate: '2026-06-01' },
    });
    expect(res.statusCode).toBe(201);
    const summary = (await app.inject({ method: 'GET', url: '/api/v1/incomes/summary?year=2026' })).json();
    expect(summary[0]).toMatchObject({ month: '2026-06', withheld: '15.00', net: '85.00' });
  });

  it('não vaza detalhes internos em erro 500', async () => {
    await makeApp();
    const service = new PortfolioService({
      trades: {
        save: async () => undefined,
        findAll: async () => {
          throw new Error('senha=123 no SQL');
        },
        findById: async () => null,
        delete: async () => false,
      },
      incomes: new InMemoryIncomeRepository(),
      quotes: { getQuotes: async () => new Map() },
      benchmark: { cdiFactor: async () => dec(1) },
      clock: { today: () => '2026-11-21' as IsoDate },
      ids: { next: () => 'x' },
    });
    await app.close();
    app = await buildApp({ service, apiKey: undefined, corsOrigins: [], rateLimitPerMinute: 1000, logger: false });
    const res = await app.inject({ method: 'GET', url: '/api/v1/trades' });
    expect(res.statusCode).toBe(500);
    expect(res.body).not.toContain('senha');
  });
});
