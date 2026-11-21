import type { Decimal } from 'decimal.js';
import type { IsoDate } from '../domain/calendar.js';
import { DomainError } from '../domain/errors.js';
import {
  type IncomeEvent,
  type IncomeMonthSummary,
  type NewIncomeInput,
  createIncome,
  summarizeIncome,
} from '../domain/income.js';
import { type LedgerResult, buildLedger } from '../domain/ledger.js';
import { sum } from '../domain/money.js';
import { type MonthlyTaxReport, computeTaxReports } from '../domain/tax.js';
import { type NewTradeInput, type Trade, createTrade } from '../domain/trade.js';
import { type PortfolioValuation, valuePortfolio } from '../domain/valuation.js';
import type {
  BenchmarkProvider,
  Clock,
  IdGenerator,
  IncomeRepository,
  QuoteProvider,
  TradeRepository,
} from './ports.js';

export interface PortfolioServiceDeps {
  trades: TradeRepository;
  incomes: IncomeRepository;
  quotes: QuoteProvider;
  benchmark: BenchmarkProvider;
  clock: Clock;
  ids: IdGenerator;
  /** Falhas de providers externos são registradas, não propagadas. */
  onProviderError?: (provider: string, error: unknown) => void;
}

export interface PortfolioSummary extends PortfolioValuation {
  readonly realizedResult: Decimal;
  readonly incomeReceived: Decimal;
  readonly firstTradeDate: IsoDate | null;
  /** Fator do CDI desde a primeira operação; null se o provider falhar. */
  readonly cdiFactor: Decimal | null;
}

export class PortfolioService {
  constructor(private readonly deps: PortfolioServiceDeps) {}

  async registerTrade(input: Omit<NewTradeInput, 'id'>): Promise<Trade> {
    const trade = createTrade({ ...input, id: this.deps.ids.next() });
    if (trade.tradeDate > this.deps.clock.today()) {
      throw new DomainError('INVALID_DATE', 'Operação com data futura', { tradeDate: trade.tradeDate });
    }
    const existing = await this.deps.trades.findAll();
    // Revalida o histórico inteiro: uma venda retroativa pode deixar posição negativa.
    buildLedger([...existing, trade]);
    await this.deps.trades.save(trade);
    return trade;
  }

  async deleteTrade(id: string): Promise<void> {
    const existing = await this.deps.trades.findAll();
    if (!existing.some((t) => t.id === id)) {
      throw new DomainError('NOT_FOUND', 'Operação não encontrada', { id });
    }
    // Apagar uma compra pode invalidar vendas posteriores.
    buildLedger(existing.filter((t) => t.id !== id));
    await this.deps.trades.delete(id);
  }

  async listTrades(): Promise<Trade[]> {
    const trades = await this.deps.trades.findAll();
    return trades.sort((a, b) => b.tradeDate.localeCompare(a.tradeDate) || a.ticker.localeCompare(b.ticker));
  }

  async registerIncome(input: Omit<NewIncomeInput, 'id'>): Promise<IncomeEvent> {
    const event = createIncome({ ...input, id: this.deps.ids.next() });
    await this.deps.incomes.save(event);
    return event;
  }

  async deleteIncome(id: string): Promise<void> {
    const deleted = await this.deps.incomes.delete(id);
    if (!deleted) throw new DomainError('NOT_FOUND', 'Provento não encontrado', { id });
  }

  async listIncomes(): Promise<IncomeEvent[]> {
    const events = await this.deps.incomes.findAll();
    return events.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate));
  }

  async incomeSummary(year: number): Promise<IncomeMonthSummary[]> {
    const events = await this.deps.incomes.findAll();
    return summarizeIncome(events.filter((e) => e.paymentDate.startsWith(`${year}-`)));
  }

  async taxReport(year: number): Promise<MonthlyTaxReport[]> {
    const { realizations } = await this.ledger();
    return computeTaxReports(realizations, year);
  }

  async summary(): Promise<PortfolioSummary> {
    const [ledger, incomes, trades] = await Promise.all([
      this.ledger(),
      this.deps.incomes.findAll(),
      this.deps.trades.findAll(),
    ]);

    const tickers = ledger.positions.map((p) => p.ticker);
    const quotes = await this.deps.quotes.getQuotes(tickers).catch((error: unknown) => {
      this.deps.onProviderError?.('quotes', error);
      return new Map();
    });

    const firstTradeDate = trades.reduce<IsoDate | null>(
      (min, t) => (min === null || t.tradeDate < min ? t.tradeDate : min),
      null,
    );
    const cdiFactor = firstTradeDate
      ? await this.deps.benchmark.cdiFactor(firstTradeDate, this.deps.clock.today()).catch((error: unknown) => {
          this.deps.onProviderError?.('benchmark', error);
          return null;
        })
      : null;

    return {
      ...valuePortfolio(ledger.positions, quotes),
      realizedResult: sum(ledger.realizations.map((r) => r.result)),
      incomeReceived: sum(incomes.map((e) => e.grossAmount)),
      firstTradeDate,
      cdiFactor,
    };
  }

  private async ledger(): Promise<LedgerResult> {
    return buildLedger(await this.deps.trades.findAll());
  }
}
