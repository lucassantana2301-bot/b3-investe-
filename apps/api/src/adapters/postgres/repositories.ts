import {
  type IncomeEvent,
  type IncomeRepository,
  type Trade,
  type TradeRepository,
  createIncome,
  createTrade,
} from '@b3pt/core';
import type pg from 'pg';

interface TradeRow {
  id: string;
  ticker: string;
  asset_class: string;
  side: string;
  quantity: number;
  unit_price: string;
  fees: string;
  trade_date: string;
  broker: string | null;
}

interface IncomeRow {
  id: string;
  ticker: string;
  type: string;
  payer_cnpj: string | null;
  gross_amount: string;
  payment_date: string;
}

// Linhas do banco passam pela mesma fábrica do domínio: dado corrompido falha alto.
const toTrade = (r: TradeRow): Trade =>
  createTrade({
    id: r.id,
    ticker: r.ticker,
    assetClass: r.asset_class,
    side: r.side,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    fees: r.fees,
    tradeDate: r.trade_date,
    broker: r.broker,
  });

const toIncome = (r: IncomeRow): IncomeEvent =>
  createIncome({
    id: r.id,
    ticker: r.ticker,
    type: r.type,
    payerCnpj: r.payer_cnpj,
    grossAmount: r.gross_amount,
    paymentDate: r.payment_date,
  });

const TRADE_COLUMNS = 'id, ticker, asset_class, side, quantity, unit_price, fees, trade_date, broker';

export class PostgresTradeRepository implements TradeRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(t: Trade): Promise<void> {
    await this.pool.query(
      `INSERT INTO trades (${TRADE_COLUMNS})
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (id) DO UPDATE SET
         ticker = EXCLUDED.ticker, asset_class = EXCLUDED.asset_class, side = EXCLUDED.side,
         quantity = EXCLUDED.quantity, unit_price = EXCLUDED.unit_price, fees = EXCLUDED.fees,
         trade_date = EXCLUDED.trade_date, broker = EXCLUDED.broker`,
      [
        t.id,
        t.ticker,
        t.assetClass,
        t.side,
        t.quantity,
        t.unitPrice.toFixed(),
        t.fees.toFixed(2),
        t.tradeDate,
        t.broker,
      ],
    );
  }

  async findAll(): Promise<Trade[]> {
    const { rows } = await this.pool.query<TradeRow>(
      `SELECT ${TRADE_COLUMNS} FROM trades ORDER BY trade_date, created_at`,
    );
    return rows.map(toTrade);
  }

  async findById(id: string): Promise<Trade | null> {
    const { rows } = await this.pool.query<TradeRow>(`SELECT ${TRADE_COLUMNS} FROM trades WHERE id = $1`, [id]);
    return rows[0] ? toTrade(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM trades WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}

export class PostgresIncomeRepository implements IncomeRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(e: IncomeEvent): Promise<void> {
    await this.pool.query(
      `INSERT INTO income_events (id, ticker, type, payer_cnpj, gross_amount, payment_date)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (id) DO UPDATE SET
         ticker = EXCLUDED.ticker, type = EXCLUDED.type, payer_cnpj = EXCLUDED.payer_cnpj,
         gross_amount = EXCLUDED.gross_amount, payment_date = EXCLUDED.payment_date`,
      [e.id, e.ticker, e.type, e.payerCnpj, e.grossAmount.toFixed(2), e.paymentDate],
    );
  }

  async findAll(): Promise<IncomeEvent[]> {
    const { rows } = await this.pool.query<IncomeRow>(
      'SELECT id, ticker, type, payer_cnpj, gross_amount, payment_date FROM income_events ORDER BY payment_date, created_at',
    );
    return rows.map(toIncome);
  }

  async delete(id: string): Promise<boolean> {
    const { rowCount } = await this.pool.query('DELETE FROM income_events WHERE id = $1', [id]);
    return (rowCount ?? 0) > 0;
  }
}
