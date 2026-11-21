import { type Quote, type QuoteProvider, type Ticker, dec } from '@b3pt/core';
import { z } from 'zod';
import { fetchJson, mapWithConcurrency } from './http/fetch-json.js';

const BrapiResponse = z.object({
  results: z
    .array(
      z.object({
        symbol: z.string(),
        regularMarketPrice: z.number().positive().nullable().optional(),
        regularMarketChangePercent: z.number().nullable().optional(),
        regularMarketTime: z.string().nullable().optional(),
      }),
    )
    .default([]),
});

export interface BrapiOptions {
  baseUrl: string;
  token: string | undefined;
  timeoutMs: number;
  cacheTtlMs: number;
  fetchImpl?: typeof fetch;
  onError?: (ticker: Ticker, error: unknown) => void;
}

/**
 * Cotações via brapi.dev. Uma requisição por ticker (compatível com o plano
 * gratuito), concorrência 4 e cache em memória com TTL para não estourar a cota.
 */
export class BrapiQuoteProvider implements QuoteProvider {
  private readonly cache = new Map<Ticker, { quote: Quote; expiresAt: number }>();

  constructor(private readonly opts: BrapiOptions) {}

  async getQuotes(tickers: readonly Ticker[]): Promise<Map<Ticker, Quote>> {
    const now = Date.now();
    const result = new Map<Ticker, Quote>();
    const missing: Ticker[] = [];

    for (const ticker of new Set(tickers)) {
      const cached = this.cache.get(ticker);
      if (cached && cached.expiresAt > now) result.set(ticker, cached.quote);
      else missing.push(ticker);
    }

    const fetched = await mapWithConcurrency(missing, 4, async (ticker) => {
      try {
        return await this.fetchOne(ticker);
      } catch (error) {
        this.opts.onError?.(ticker, error);
        return null;
      }
    });

    for (const quote of fetched) {
      if (!quote) continue;
      result.set(quote.ticker, quote);
      this.cache.set(quote.ticker, { quote, expiresAt: Date.now() + this.opts.cacheTtlMs });
    }
    return result;
  }

  private async fetchOne(ticker: Ticker): Promise<Quote | null> {
    const url = new URL(`${this.opts.baseUrl.replace(/\/$/, '')}/quote/${encodeURIComponent(ticker)}`);
    // Token no header, não na query string: não aparece em logs de proxy.
    const headers: Record<string, string> = this.opts.token ? { authorization: `Bearer ${this.opts.token}` } : {};
    const body = await fetchJson(url, BrapiResponse, {
      timeoutMs: this.opts.timeoutMs,
      headers,
      ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
    });
    const item = body.results.find((r) => r.symbol.toUpperCase() === ticker);
    if (!item?.regularMarketPrice) return null;
    return {
      ticker,
      price: dec(item.regularMarketPrice),
      changePercent: item.regularMarketChangePercent ?? null,
      asOf: item.regularMarketTime ?? new Date().toISOString(),
    };
  }
}
