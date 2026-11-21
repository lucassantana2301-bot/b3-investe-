import type { Decimal } from 'decimal.js';
import type { Ticker } from '../domain/asset.js';
import type { IsoDate } from '../domain/calendar.js';
import type { IncomeEvent } from '../domain/income.js';
import type { Trade } from '../domain/trade.js';
import type { Quote } from '../domain/valuation.js';

/**
 * Portas da arquitetura hexagonal. O núcleo não conhece Postgres,
 * Access nem HTTP: os adapters implementam estas interfaces.
 */
export interface TradeRepository {
  save(trade: Trade): Promise<void>;
  findAll(): Promise<Trade[]>;
  findById(id: string): Promise<Trade | null>;
  delete(id: string): Promise<boolean>;
}

export interface IncomeRepository {
  save(event: IncomeEvent): Promise<void>;
  findAll(): Promise<IncomeEvent[]>;
  delete(id: string): Promise<boolean>;
}

export interface QuoteProvider {
  /** Tickers sem cotação simplesmente não aparecem no Map (falha parcial não derruba o painel). */
  getQuotes(tickers: readonly Ticker[]): Promise<Map<Ticker, Quote>>;
}

export interface BenchmarkProvider {
  /** Fator acumulado do CDI no período (ex.: 1.1043 = +10,43%). */
  cdiFactor(from: IsoDate, to: IsoDate): Promise<Decimal>;
}

export interface Clock {
  today(): IsoDate;
}

export interface IdGenerator {
  next(): string;
}
