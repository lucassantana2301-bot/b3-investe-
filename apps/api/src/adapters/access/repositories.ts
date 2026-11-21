import {
  type IncomeEvent,
  type IncomeRepository,
  type Trade,
  type TradeRepository,
  createIncome,
  createTrade,
} from '@b3pt/core';
import type { OdbcClient } from './odbc-client.js';

/**
 * Adapter Microsoft Access via ODBC.
 *
 * Particularidades tratadas aqui:
 *  - DATETIME volta como string 'YYYY-MM-DD HH:MM:SS' ou Date: normalizamos para 'YYYY-MM-DD'.
 *  - DECIMAL/CURRENCY pode voltar como string ou number: convertemos via String() para o Decimal.
 *  - Identificadores entre colchetes para evitar palavras reservadas do Jet/ACE (ex.: [type]).
 *  - Sem UPSERT no Access: save faz UPDATE e, se não afetou linha, INSERT.
 */
type Raw = string | number | Date | null;

interface TradeRow {
  id: string;
  ticker: string;
  asset_class: string;
  side: string;
  quantity: Raw;
  unit_price: Raw;
  fees: Raw;
  trade_date: Raw;
  broker: string | null;
}

interface IncomeRow {
  id: string;
  ticker: string;
  type: string;
  payer_cnpj: string | null;
  gross_amount: Raw;
  payment_date: Raw;
}

export function accessDateToIso(value: Raw): string {
  if (value instanceof Date) {
    // Data local do Access (sem fuso): usa componentes locais, não UTC.
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  const text = String(value ?? '');
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(text);
  if (!match) throw new Error(`Data inválida vinda do Access: "${text}"`);
  return match[1]!;
}

const toNumberString = (value: Raw): string => {
  if (value === null || value instanceof Date) throw new Error('Valor numérico inválido vindo do Access');
  // Access pode usar vírgula decimal dependendo da localidade do driver.
  return String(value).replace(',', '.');
};

const TRADE_COLUMNS = '[id], [ticker], [asset_class], [side], [quantity], [unit_price], [fees], [trade_date], [broker]';
const INCOME_COLUMNS = '[id], [ticker], [type], [payer_cnpj], [gross_amount], [payment_date]';

export class AccessTradeRepository implements TradeRepository {
  constructor(private readonly db: OdbcClient) {}

  async save(t: Trade): Promise<void> {
    const values = [
      t.ticker,
      t.assetClass,
      t.side,
      t.quantity,
      t.unitPrice.toFixed(),
      t.fees.toFixed(2),
      t.tradeDate,
      t.broker,
    ];
    if (await this.exists('trades', t.id)) {
      await this.db.query(
        `UPDATE trades SET [ticker] = ?, [asset_class] = ?, [side] = ?, [quantity] = ?, [unit_price] = ?,
         [fees] = ?, [trade_date] = ?, [broker] = ? WHERE [id] = ?`,
        [...values, t.id],
      );
      return;
    }
    await this.db.query(`INSERT INTO trades (${TRADE_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [t.id, ...values]);
  }

  async findAll(): Promise<Trade[]> {
    const rows = await this.db.query<TradeRow>(
      `SELECT ${TRADE_COLUMNS} FROM trades ORDER BY [trade_date], [created_at]`,
    );
    return rows.map((r) => this.toTrade(r));
  }

  async findById(id: string): Promise<Trade | null> {
    const rows = await this.db.query<TradeRow>(`SELECT ${TRADE_COLUMNS} FROM trades WHERE [id] = ?`, [id]);
    return rows[0] ? this.toTrade(rows[0]) : null;
  }

  async delete(id: string): Promise<boolean> {
    if (!(await this.exists('trades', id))) return false;
    await this.db.query('DELETE FROM trades WHERE [id] = ?', [id]);
    return true;
  }

  private async exists(table: 'trades', id: string): Promise<boolean> {
    const rows = await this.db.query<{ n: Raw }>(`SELECT COUNT(*) AS n FROM ${table} WHERE [id] = ?`, [id]);
    return Number(rows[0]?.n ?? 0) > 0;
  }

  private toTrade(r: TradeRow): Trade {
    return createTrade({
      id: r.id,
      ticker: r.ticker,
      assetClass: r.asset_class,
      side: r.side,
      quantity: Number(r.quantity),
      unitPrice: toNumberString(r.unit_price),
      fees: toNumberString(r.fees),
      tradeDate: accessDateToIso(r.trade_date),
      broker: r.broker,
    });
  }
}

export class AccessIncomeRepository implements IncomeRepository {
  constructor(private readonly db: OdbcClient) {}

  async save(e: IncomeEvent): Promise<void> {
    const values = [e.ticker, e.type, e.payerCnpj, e.grossAmount.toFixed(2), e.paymentDate];
    if (await this.exists(e.id)) {
      await this.db.query(
        'UPDATE income_events SET [ticker] = ?, [type] = ?, [payer_cnpj] = ?, [gross_amount] = ?, [payment_date] = ? WHERE [id] = ?',
        [...values, e.id],
      );
      return;
    }
    await this.db.query(`INSERT INTO income_events (${INCOME_COLUMNS}) VALUES (?, ?, ?, ?, ?, ?)`, [e.id, ...values]);
  }

  async findAll(): Promise<IncomeEvent[]> {
    const rows = await this.db.query<IncomeRow>(
      `SELECT ${INCOME_COLUMNS} FROM income_events ORDER BY [payment_date], [created_at]`,
    );
    return rows.map((r) =>
      createIncome({
        id: r.id,
        ticker: r.ticker,
        type: r.type,
        payerCnpj: r.payer_cnpj,
        grossAmount: toNumberString(r.gross_amount),
        paymentDate: accessDateToIso(r.payment_date),
      }),
    );
  }

  async delete(id: string): Promise<boolean> {
    if (!(await this.exists(id))) return false;
    await this.db.query('DELETE FROM income_events WHERE [id] = ?', [id]);
    return true;
  }

  private async exists(id: string): Promise<boolean> {
    const rows = await this.db.query<{ n: Raw }>('SELECT COUNT(*) AS n FROM income_events WHERE [id] = ?', [id]);
    return Number(rows[0]?.n ?? 0) > 0;
  }
}
