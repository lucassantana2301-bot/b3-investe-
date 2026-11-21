import type { Decimal } from 'decimal.js';
import { type AssetClass, type Ticker, isAssetClass, parseTicker } from './asset.js';
import { type IsoDate, parseIsoDate } from './calendar.js';
import { DomainError } from './errors.js';
import { ZERO, parseMoney } from './money.js';

export type TradeSide = 'BUY' | 'SELL';

export interface Trade {
  readonly id: string;
  readonly ticker: Ticker;
  readonly assetClass: AssetClass;
  readonly side: TradeSide;
  /** Quantidade inteira de papéis (lote padrão ou fracionário). */
  readonly quantity: number;
  /** Preço unitário de execução, sem custos. */
  readonly unitPrice: Decimal;
  /** Corretagem + emolumentos + taxa de liquidação da nota. */
  readonly fees: Decimal;
  readonly tradeDate: IsoDate;
  readonly broker: string | null;
}

export interface NewTradeInput {
  id: string;
  ticker: string;
  assetClass: string;
  side: string;
  quantity: number;
  unitPrice: string | number;
  fees?: string | number;
  tradeDate: string;
  broker?: string | null;
}

const MAX_QUANTITY = 1_000_000_000;

/** Fábrica com validação: nenhum Trade inválido entra no domínio. */
export function createTrade(input: NewTradeInput): Trade {
  if (input.side !== 'BUY' && input.side !== 'SELL') {
    throw new DomainError('INVALID_AMOUNT', 'side deve ser BUY ou SELL', { side: input.side });
  }
  if (!isAssetClass(input.assetClass)) {
    throw new DomainError('INVALID_AMOUNT', 'assetClass deve ser STOCK, FII, ETF ou BDR', {
      assetClass: input.assetClass,
    });
  }
  if (!Number.isSafeInteger(input.quantity) || input.quantity <= 0 || input.quantity > MAX_QUANTITY) {
    throw new DomainError('INVALID_QUANTITY', 'Quantidade deve ser inteira e positiva', {
      quantity: input.quantity,
    });
  }

  const unitPrice = parseMoney(input.unitPrice, 'unitPrice');
  if (unitPrice.lte(0)) {
    throw new DomainError('INVALID_PRICE', 'Preço unitário deve ser maior que zero', {
      unitPrice: unitPrice.toString(),
    });
  }
  const fees = input.fees === undefined ? ZERO : parseMoney(input.fees, 'fees');
  if (fees.isNegative()) {
    throw new DomainError('INVALID_AMOUNT', 'Custos não podem ser negativos', { fees: fees.toString() });
  }

  const broker = input.broker?.trim() ? input.broker.trim().slice(0, 80) : null;

  return Object.freeze({
    id: input.id,
    ticker: parseTicker(input.ticker),
    assetClass: input.assetClass,
    side: input.side,
    quantity: input.quantity,
    unitPrice,
    fees,
    tradeDate: parseIsoDate(input.tradeDate),
    broker,
  });
}

export function grossValue(trade: Trade): Decimal {
  return trade.unitPrice.times(trade.quantity);
}
