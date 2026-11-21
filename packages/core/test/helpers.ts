import { type Trade, createTrade } from '../src/domain/trade.js';

let seq = 0;

export function trade(
  side: 'BUY' | 'SELL',
  ticker: string,
  quantity: number,
  unitPrice: string | number,
  tradeDate: string,
  opts: { fees?: string | number; assetClass?: 'STOCK' | 'FII' | 'ETF' | 'BDR' } = {},
): Trade {
  seq += 1;
  return createTrade({
    id: `t-${seq}`,
    ticker,
    side,
    quantity,
    unitPrice,
    tradeDate,
    assetClass: opts.assetClass ?? 'STOCK',
    ...(opts.fees !== undefined ? { fees: opts.fees } : {}),
  });
}
