import { type BenchmarkProvider, type Dec, type IsoDate, dec } from '@b3pt/core';
import { z } from 'zod';
import { fetchJson } from './http/fetch-json.js';

/** Série 12 do SGS/BCB: taxa DI diária em % a.d. */
const CDI_SERIES = 12;
/** A API do SGS limita consultas de séries diárias a 10 anos; usamos janelas de 5. */
const MAX_WINDOW_YEARS = 5;

const SgsResponse = z.array(z.object({ data: z.string(), valor: z.string() }));

const toBr = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

function addYears(iso: string, years: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export interface BcbOptions {
  baseUrl: string;
  timeoutMs: number;
  cacheTtlMs: number;
  fetchImpl?: typeof fetch;
}

export class BcbBenchmarkProvider implements BenchmarkProvider {
  private readonly cache = new Map<string, { value: Dec; expiresAt: number }>();

  constructor(private readonly opts: BcbOptions) {}

  async cdiFactor(from: IsoDate, to: IsoDate): Promise<Dec> {
    if (from > to) return dec(1);
    const key = `${from}:${to}`;
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    let factor = dec(1);
    for (let start: string = from; start <= to;) {
      const windowEnd = addYears(start, MAX_WINDOW_YEARS);
      const end = windowEnd < to ? windowEnd : to;
      const url = new URL(`${this.opts.baseUrl.replace(/\/$/, '')}/dados/serie/bcdata.sgs.${CDI_SERIES}/dados`);
      url.searchParams.set('formato', 'json');
      url.searchParams.set('dataInicial', toBr(start));
      url.searchParams.set('dataFinal', toBr(end));

      const points = await fetchJson(url, SgsResponse, {
        timeoutMs: this.opts.timeoutMs,
        ...(this.opts.fetchImpl ? { fetchImpl: this.opts.fetchImpl } : {}),
      });
      for (const p of points) {
        factor = factor.times(dec(1).plus(dec(p.valor.replace(',', '.')).div(100)));
      }
      start = nextDay(end);
    }

    this.cache.set(key, { value: factor, expiresAt: Date.now() + this.opts.cacheTtlMs });
    return factor;
  }
}
