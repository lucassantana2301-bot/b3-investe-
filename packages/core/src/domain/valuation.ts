import type { Decimal } from 'decimal.js';
import type { AssetClass, Ticker } from './asset.js';
import type { Position } from './ledger.js';
import { ZERO, sum } from './money.js';

export interface Quote {
  readonly ticker: Ticker;
  readonly price: Decimal;
  readonly changePercent: number | null;
  readonly asOf: string;
}

export interface ValuedPosition extends Position {
  readonly price: Decimal | null;
  readonly marketValue: Decimal | null;
  readonly unrealizedResult: Decimal | null;
  readonly unrealizedPercent: Decimal | null;
  /** Participação no valor de mercado total (0..1); null sem cotação. */
  readonly weight: Decimal | null;
}

export interface PortfolioValuation {
  readonly positions: readonly ValuedPosition[];
  readonly totalCost: Decimal;
  /** Soma só das posições com cotação; veja `missingQuotes`. */
  readonly marketValue: Decimal;
  readonly unrealizedResult: Decimal;
  readonly allocation: Readonly<Record<AssetClass, Decimal>>;
  readonly missingQuotes: readonly Ticker[];
}

export function valuePortfolio(positions: readonly Position[], quotes: ReadonlyMap<Ticker, Quote>): PortfolioValuation {
  const missingQuotes: Ticker[] = [];
  const partial = positions.map((p) => {
    const quote = quotes.get(p.ticker);
    if (!quote) {
      missingQuotes.push(p.ticker);
      return { ...p, price: null, marketValue: null, unrealizedResult: null, unrealizedPercent: null };
    }
    const marketValue = quote.price.times(p.quantity);
    const unrealizedResult = marketValue.minus(p.totalCost);
    return {
      ...p,
      price: quote.price,
      marketValue,
      unrealizedResult,
      unrealizedPercent: p.totalCost.isZero() ? null : unrealizedResult.div(p.totalCost),
    };
  });

  const marketValue = sum(partial.flatMap((p) => (p.marketValue ? [p.marketValue] : [])));
  const pricedCost = sum(partial.filter((p) => p.marketValue).map((p) => p.totalCost));

  const allocation: Record<AssetClass, Decimal> = { STOCK: ZERO, FII: ZERO, ETF: ZERO, BDR: ZERO };
  for (const p of partial) {
    if (p.marketValue) allocation[p.assetClass] = allocation[p.assetClass].plus(p.marketValue);
  }

  return {
    positions: partial.map((p) => ({
      ...p,
      weight: p.marketValue && marketValue.isPositive() ? p.marketValue.div(marketValue) : null,
    })),
    totalCost: sum(positions.map((p) => p.totalCost)),
    marketValue,
    unrealizedResult: marketValue.minus(pricedCost),
    allocation,
    missingQuotes,
  };
}
