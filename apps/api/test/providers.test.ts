import type { IsoDate, Ticker } from '@b3pt/core';
import { describe, expect, it, vi } from 'vitest';
import { BcbBenchmarkProvider } from '../src/adapters/bcb-benchmark-provider.js';
import { BrapiQuoteProvider } from '../src/adapters/brapi-quote-provider.js';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('BrapiQuoteProvider', () => {
  it('busca, cacheia e tolera falha parcial sem vazar o token na URL', async () => {
    const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      expect(url).not.toContain('token');
      expect((init?.headers as Record<string, string>).authorization).toBe('Bearer secreto');
      if (url.endsWith('/PETR4'))
        return json({ results: [{ symbol: 'PETR4', regularMarketPrice: 38.12, regularMarketChangePercent: 1.2 }] });
      return json({ error: true }, 500);
    });
    const onError = vi.fn();
    const provider = new BrapiQuoteProvider({
      baseUrl: 'https://brapi.test/api',
      token: 'secreto',
      timeoutMs: 1000,
      cacheTtlMs: 60_000,
      fetchImpl,
      onError,
    });

    const first = await provider.getQuotes(['PETR4', 'VALE3'] as Ticker[]);
    expect(first.get('PETR4' as Ticker)?.price.toFixed(2)).toBe('38.12');
    expect(first.has('VALE3' as Ticker)).toBe(false);
    expect(onError).toHaveBeenCalledOnce();

    await provider.getQuotes(['PETR4'] as Ticker[]);
    expect(fetchImpl).toHaveBeenCalledTimes(2); // PETR4 veio do cache
  });
});

describe('BcbBenchmarkProvider', () => {
  it('compõe as taxas diárias do CDI', async () => {
    const fetchImpl = vi.fn(async () =>
      json([
        { data: '02/03/2026', valor: '0.055131' },
        { data: '03/03/2026', valor: '0.055131' },
      ]),
    );
    const provider = new BcbBenchmarkProvider({
      baseUrl: 'https://bcb.test',
      timeoutMs: 1000,
      cacheTtlMs: 1000,
      fetchImpl,
    });
    const factor = await provider.cdiFactor('2026-03-02' as IsoDate, '2026-03-03' as IsoDate);
    expect(factor.toFixed(8)).toBe('1.00110292');
    const url = new URL(String((fetchImpl.mock.calls[0] as unknown as [URL])[0]));
    expect(url.pathname).toBe('/dados/serie/bcdata.sgs.12/dados');
    expect(url.searchParams.get('dataInicial')).toBe('02/03/2026');
  });

  it('divide períodos longos em janelas de 5 anos', async () => {
    const fetchImpl = vi.fn(async () => json([]));
    const provider = new BcbBenchmarkProvider({
      baseUrl: 'https://bcb.test',
      timeoutMs: 1000,
      cacheTtlMs: 1000,
      fetchImpl,
    });
    await provider.cdiFactor('2014-01-01' as IsoDate, '2026-11-21' as IsoDate);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
