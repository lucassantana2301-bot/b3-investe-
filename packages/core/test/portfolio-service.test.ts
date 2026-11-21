import { describe, expect, it, vi } from 'vitest';
import { InMemoryIncomeRepository, InMemoryTradeRepository } from '../src/adapters/in-memory.js';
import type { BenchmarkProvider, QuoteProvider } from '../src/application/ports.js';
import { PortfolioService } from '../src/application/portfolio-service.js';
import type { Ticker } from '../src/domain/asset.js';
import type { IsoDate } from '../src/domain/calendar.js';
import { DomainError } from '../src/domain/errors.js';
import { dec } from '../src/domain/money.js';
import type { Quote } from '../src/domain/valuation.js';

function makeService(overrides: { quotes?: QuoteProvider; benchmark?: BenchmarkProvider } = {}) {
  let id = 0;
  const onProviderError = vi.fn();
  const service = new PortfolioService({
    trades: new InMemoryTradeRepository(),
    incomes: new InMemoryIncomeRepository(),
    quotes: overrides.quotes ?? {
      getQuotes: async (tickers) =>
        new Map<Ticker, Quote>(
          tickers.map((t) => [t, { ticker: t, price: dec('40'), changePercent: 1.5, asOf: '2026-11-20' }]),
        ),
    },
    benchmark: overrides.benchmark ?? { cdiFactor: async () => dec('1.1') },
    clock: { today: () => '2026-11-21' as IsoDate },
    ids: { next: () => `id-${++id}` },
    onProviderError,
  });
  return { service, onProviderError };
}

const buy = {
  ticker: 'PETR4',
  assetClass: 'STOCK',
  side: 'BUY',
  quantity: 100,
  unitPrice: '30',
  tradeDate: '2026-03-02',
};

describe('PortfolioService', () => {
  it('registra operação e calcula valor de mercado', async () => {
    const { service } = makeService();
    await service.registerTrade(buy);
    const summary = await service.summary();
    expect(summary.marketValue.toFixed(2)).toBe('4000.00');
    expect(summary.unrealizedResult.toFixed(2)).toBe('1000.00');
    expect(summary.cdiFactor?.toFixed(2)).toBe('1.10');
    expect(summary.positions[0]!.weight?.toFixed(2)).toBe('1.00');
  });

  it('rejeita venda sem posição e data futura', async () => {
    const { service } = makeService();
    await expect(service.registerTrade({ ...buy, side: 'SELL' })).rejects.toBeInstanceOf(DomainError);
    await expect(service.registerTrade({ ...buy, tradeDate: '2026-12-01' })).rejects.toThrow(/futura/);
  });

  it('impede apagar compra que sustenta uma venda posterior', async () => {
    const { service } = makeService();
    const b = await service.registerTrade(buy);
    await service.registerTrade({ ...buy, side: 'SELL', quantity: 50, tradeDate: '2026-04-01' });
    await expect(service.deleteTrade(b.id)).rejects.toThrow(/maior que a posição/);
    await expect(service.deleteTrade('nao-existe')).rejects.toThrow(/não encontrada/);
  });

  it('degrada sem derrubar quando os providers externos falham', async () => {
    const { service, onProviderError } = makeService({
      quotes: { getQuotes: async () => Promise.reject(new Error('brapi fora')) },
      benchmark: { cdiFactor: async () => Promise.reject(new Error('bcb fora')) },
    });
    await service.registerTrade(buy);
    const summary = await service.summary();
    expect(summary.missingQuotes).toEqual(['PETR4']);
    expect(summary.cdiFactor).toBeNull();
    expect(onProviderError).toHaveBeenCalledTimes(2);
  });
});
