import type { Decimal } from 'decimal.js';
import type { AssetClass, Ticker } from './asset.js';
import { type IsoDate, compareIsoDate } from './calendar.js';
import { DomainError } from './errors.js';
import { ZERO, dec } from './money.js';
import type { Trade } from './trade.js';

export type Modality = 'SWING' | 'DAY_TRADE';

/** Resultado realizado de uma venda (ou parte dela) numa modalidade. */
export interface Realization {
  readonly date: IsoDate;
  readonly ticker: Ticker;
  readonly assetClass: AssetClass;
  readonly modality: Modality;
  readonly quantity: number;
  /** Valor bruto de alienação (preço x quantidade), base da isenção de R$ 20 mil e do IRRF. */
  readonly grossSales: Decimal;
  /** Lucro/prejuízo líquido de custos. */
  readonly result: Decimal;
}

export interface Position {
  readonly ticker: Ticker;
  readonly assetClass: AssetClass;
  readonly quantity: number;
  /** Custo total de aquisição, incluindo taxas (base do preço médio). */
  readonly totalCost: Decimal;
  readonly averagePrice: Decimal;
}

export interface LedgerResult {
  readonly positions: readonly Position[];
  readonly realizations: readonly Realization[];
}

interface MutablePosition {
  ticker: Ticker;
  assetClass: AssetClass;
  quantity: number;
  totalCost: Decimal;
}

interface DayAggregate {
  buyQty: number;
  buyCost: Decimal; // inclui taxas
  sellQty: number;
  sellGross: Decimal;
  sellNet: Decimal; // bruto - taxas
}

/**
 * Processa as operações em ordem cronológica e calcula preço médio
 * ponderado e resultados realizados, separando day trade de swing trade.
 *
 * Regra de day trade (IN RFB 1.585/2015, art. 65): no mesmo dia e ativo,
 * a quantidade casada min(compras, vendas) é day trade, apurada pelos
 * preços médios do dia. O excedente de compra entra no estoque; o
 * excedente de venda baixa o estoque pelo preço médio histórico (swing).
 */
export function buildLedger(trades: readonly Trade[]): LedgerResult {
  const byTicker = new Map<Ticker, Trade[]>();
  for (const trade of trades) {
    const list = byTicker.get(trade.ticker) ?? [];
    list.push(trade);
    byTicker.set(trade.ticker, list);
  }

  const positions: Position[] = [];
  const realizations: Realization[] = [];

  for (const [ticker, tickerTrades] of byTicker) {
    const assetClass = tickerTrades[0]!.assetClass;
    const conflict = tickerTrades.find((t) => t.assetClass !== assetClass);
    if (conflict) {
      throw new DomainError('ASSET_CLASS_CONFLICT', `${ticker} registrado com classes diferentes`, {
        ticker,
        expected: assetClass,
        found: conflict.assetClass,
        tradeId: conflict.id,
      });
    }

    const state: MutablePosition = { ticker, assetClass, quantity: 0, totalCost: ZERO };

    for (const [date, day] of aggregateByDay(tickerTrades)) {
      processDay(state, date, day, realizations);
    }

    if (state.quantity > 0) {
      positions.push(
        Object.freeze({
          ticker,
          assetClass,
          quantity: state.quantity,
          totalCost: state.totalCost,
          averagePrice: state.totalCost.div(state.quantity),
        }),
      );
    }
  }

  positions.sort((a, b) => a.ticker.localeCompare(b.ticker));
  realizations.sort((a, b) => compareIsoDate(a.date, b.date) || a.ticker.localeCompare(b.ticker));
  return { positions, realizations };
}

function aggregateByDay(trades: readonly Trade[]): Array<[IsoDate, DayAggregate]> {
  const days = new Map<IsoDate, DayAggregate>();
  for (const t of trades) {
    const day =
      days.get(t.tradeDate) ??
      ({ buyQty: 0, buyCost: ZERO, sellQty: 0, sellGross: ZERO, sellNet: ZERO } satisfies DayAggregate);
    const gross = t.unitPrice.times(t.quantity);
    if (t.side === 'BUY') {
      day.buyQty += t.quantity;
      day.buyCost = day.buyCost.plus(gross).plus(t.fees);
    } else {
      day.sellQty += t.quantity;
      day.sellGross = day.sellGross.plus(gross);
      day.sellNet = day.sellNet.plus(gross).minus(t.fees);
    }
    days.set(t.tradeDate, day);
  }
  return [...days.entries()].sort(([a], [b]) => compareIsoDate(a, b));
}

function processDay(state: MutablePosition, date: IsoDate, day: DayAggregate, out: Realization[]): void {
  const avgBuy = day.buyQty > 0 ? day.buyCost.div(day.buyQty) : ZERO;
  const avgSellNet = day.sellQty > 0 ? day.sellNet.div(day.sellQty) : ZERO;
  const avgSellGross = day.sellQty > 0 ? day.sellGross.div(day.sellQty) : ZERO;

  const dayTradeQty = Math.min(day.buyQty, day.sellQty);
  if (dayTradeQty > 0) {
    out.push(
      Object.freeze({
        date,
        ticker: state.ticker,
        assetClass: state.assetClass,
        modality: 'DAY_TRADE' as const,
        quantity: dayTradeQty,
        grossSales: avgSellGross.times(dayTradeQty),
        result: avgSellNet.minus(avgBuy).times(dayTradeQty),
      }),
    );
  }

  const remainingBuy = day.buyQty - dayTradeQty;
  if (remainingBuy > 0) {
    state.quantity += remainingBuy;
    state.totalCost = state.totalCost.plus(avgBuy.times(remainingBuy));
  }

  const remainingSell = day.sellQty - dayTradeQty;
  if (remainingSell > 0) {
    if (remainingSell > state.quantity) {
      throw new DomainError(
        'INSUFFICIENT_POSITION',
        `Venda de ${state.ticker} maior que a posição (venda a descoberto não suportada)`,
        {
          ticker: state.ticker,
          date,
          selling: remainingSell,
          available: state.quantity,
        },
      );
    }
    const avgCost = state.totalCost.div(state.quantity);
    const costOut = avgCost.times(remainingSell);
    out.push(
      Object.freeze({
        date,
        ticker: state.ticker,
        assetClass: state.assetClass,
        modality: 'SWING' as const,
        quantity: remainingSell,
        grossSales: avgSellGross.times(remainingSell),
        result: avgSellNet.times(remainingSell).minus(costOut),
      }),
    );
    state.quantity -= remainingSell;
    // Zera o custo residual de arredondamento quando a posição é encerrada.
    state.totalCost = state.quantity === 0 ? dec(0) : state.totalCost.minus(costOut);
  }
}
