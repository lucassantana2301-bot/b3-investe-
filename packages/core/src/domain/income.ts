import type { Decimal } from 'decimal.js';
import { type Ticker, parseTicker } from './asset.js';
import { type IsoDate, type YearMonth, parseIsoDate, yearMonthOf } from './calendar.js';
import { DomainError } from './errors.js';
import { ZERO, dec, parseMoney, sum, toCents } from './money.js';

/**
 * DIVIDEND: dividendos de ações (Lei 15.270/2025: 10% retido na fonte sobre o
 *           TOTAL do mês quando a mesma empresa paga > R$ 50 mil à mesma PF).
 * JCP:      juros sobre capital próprio, 15% retido na fonte.
 * FII_INCOME: rendimento de FII, isento para PF nas condições da Lei 11.033/2004.
 */
export const INCOME_TYPES = ['DIVIDEND', 'JCP', 'FII_INCOME'] as const;
export type IncomeType = (typeof INCOME_TYPES)[number];

export interface IncomeEvent {
  readonly id: string;
  readonly ticker: Ticker;
  readonly type: IncomeType;
  /** CNPJ da fonte pagadora (só dígitos). Agrupa o limite de R$ 50 mil por empresa. */
  readonly payerCnpj: string | null;
  readonly grossAmount: Decimal;
  readonly paymentDate: IsoDate;
}

export interface NewIncomeInput {
  id: string;
  ticker: string;
  type: string;
  payerCnpj?: string | null;
  grossAmount: string | number;
  paymentDate: string;
}

export const DIVIDEND_RULES = Object.freeze({
  monthlyThresholdPerPayer: dec('50000'),
  dividendWithholdingRate: dec('0.10'),
  jcpWithholdingRate: dec('0.15'),
});

export function createIncome(input: NewIncomeInput): IncomeEvent {
  if (!(INCOME_TYPES as readonly string[]).includes(input.type)) {
    throw new DomainError('INVALID_AMOUNT', 'type deve ser DIVIDEND, JCP ou FII_INCOME', { type: input.type });
  }
  const grossAmount = parseMoney(input.grossAmount, 'grossAmount');
  if (grossAmount.lte(0)) {
    throw new DomainError('INVALID_AMOUNT', 'Valor bruto deve ser positivo', { grossAmount: grossAmount.toString() });
  }
  return Object.freeze({
    id: input.id,
    ticker: parseTicker(input.ticker),
    type: input.type as IncomeType,
    payerCnpj: normalizeCnpj(input.payerCnpj ?? null),
    grossAmount,
    paymentDate: parseIsoDate(input.paymentDate),
  });
}

export function normalizeCnpj(raw: string | null): string | null {
  if (raw === null || raw.trim() === '') return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length !== 14 || !isValidCnpj(digits)) {
    throw new DomainError('INVALID_CNPJ', 'CNPJ inválido', { value: raw });
  }
  return digits;
}

/** Validação dos dígitos verificadores (módulo 11). */
export function isValidCnpj(digits: string): boolean {
  if (!/^\d{14}$/.test(digits) || /^(\d)\1{13}$/.test(digits)) return false;
  const calc = (base: string, weights: number[]): number => {
    const total = weights.reduce((acc, w, i) => acc + Number(base[i]) * w, 0);
    const rest = total % 11;
    return rest < 2 ? 0 : 11 - rest;
  };
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, ...w1];
  const d1 = calc(digits.slice(0, 12), w1);
  const d2 = calc(digits.slice(0, 12) + d1, w2);
  return digits.endsWith(`${d1}${d2}`);
}

export interface IncomeMonthSummary {
  readonly month: YearMonth;
  readonly gross: Decimal;
  readonly withheld: Decimal;
  readonly net: Decimal;
  readonly byType: Readonly<Record<IncomeType, Decimal>>;
  /** Pagadores que ultrapassaram R$ 50 mil no mês (dividendos sujeitos aos 10%). */
  readonly payersOverThreshold: readonly string[];
}

/**
 * Estima a retenção na fonte. Dividendos sem CNPJ são agrupados pelo
 * ticker como aproximação da fonte pagadora.
 */
export function summarizeIncome(events: readonly IncomeEvent[]): IncomeMonthSummary[] {
  const byMonth = new Map<YearMonth, IncomeEvent[]>();
  for (const e of events) {
    const ym = yearMonthOf(e.paymentDate);
    byMonth.set(ym, [...(byMonth.get(ym) ?? []), e]);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, list]) => {
      const byType: Record<IncomeType, Decimal> = { DIVIDEND: ZERO, JCP: ZERO, FII_INCOME: ZERO };
      for (const e of list) byType[e.type] = byType[e.type].plus(e.grossAmount);

      const dividendsByPayer = new Map<string, Decimal>();
      for (const e of list.filter((x) => x.type === 'DIVIDEND')) {
        const key = e.payerCnpj ?? `ticker:${e.ticker}`;
        dividendsByPayer.set(key, (dividendsByPayer.get(key) ?? ZERO).plus(e.grossAmount));
      }
      const payersOverThreshold: string[] = [];
      let dividendWithholding = ZERO;
      for (const [payer, total] of dividendsByPayer) {
        if (total.gt(DIVIDEND_RULES.monthlyThresholdPerPayer)) {
          payersOverThreshold.push(payer);
          dividendWithholding = dividendWithholding.plus(toCents(total.times(DIVIDEND_RULES.dividendWithholdingRate)));
        }
      }

      const jcpWithholding = sum(
        list
          .filter((e) => e.type === 'JCP')
          .map((e) => toCents(e.grossAmount.times(DIVIDEND_RULES.jcpWithholdingRate))),
      );
      const gross = sum(list.map((e) => e.grossAmount));
      const withheld = dividendWithholding.plus(jcpWithholding);

      return Object.freeze({
        month,
        gross,
        withheld,
        net: gross.minus(withheld),
        byType,
        payersOverThreshold: payersOverThreshold.sort(),
      });
    });
}
