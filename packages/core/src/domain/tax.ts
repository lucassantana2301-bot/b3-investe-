import type { Decimal } from 'decimal.js';
import { type IsoDate, type YearMonth, darfDueDate, nextYearMonth, yearMonthOf } from './calendar.js';
import type { Realization } from './ledger.js';
import { ZERO, dec, sum, toCents } from './money.js';

/**
 * Regras vigentes em 2026 para pessoa física no mercado à vista
 * (IN RFB 1.585/2015 e Lei 11.033/2004):
 *  - Swing trade de ações, ETFs e BDRs: 15%.
 *  - Isenção quando o total VENDIDO de ações (não ETF/BDR/FII) no mês é <= R$ 20.000.
 *  - Day trade: 20%, sem isenção.
 *  - FII (venda de cotas, qualquer modalidade): 20%, sem isenção.
 *  - Prejuízos só compensam lucros da mesma categoria (swing, day trade, FII), sem prazo.
 *  - IRRF: 0,005% sobre alienações em operações comuns; 1% sobre o lucro do day trade.
 *    Retenção abaixo de R$ 1,00 é dispensada.
 *  - DARF (código 6015) abaixo de R$ 10,00 é acumulado para o mês seguinte.
 */
export const TAX_RULES = Object.freeze({
  swingRate: dec('0.15'),
  dayTradeRate: dec('0.20'),
  fiiRate: dec('0.20'),
  stockExemptionLimit: dec('20000'),
  irrfSwingRate: dec('0.00005'),
  irrfDayTradeRate: dec('0.01'),
  irrfMinimum: dec('1'),
  darfMinimum: dec('10'),
  darfCode: '6015',
});

export type TaxBucket = 'SWING' | 'DAY_TRADE' | 'FII';

export interface BucketReport {
  readonly bucket: TaxBucket;
  readonly rate: Decimal;
  /** Resultado do mês antes da compensação (lucro isento já excluído). */
  readonly monthResult: Decimal;
  readonly lossCarryIn: Decimal;
  readonly lossUsed: Decimal;
  readonly lossCarryOut: Decimal;
  readonly taxableBase: Decimal;
  readonly tax: Decimal;
}

export interface MonthlyTaxReport {
  readonly month: YearMonth;
  readonly stockSwingSales: Decimal;
  readonly stockExemptionApplied: boolean;
  /** Lucro de ações em swing trade isento pela regra dos R$ 20 mil (vai na ficha de isentos). */
  readonly exemptStockProfit: Decimal;
  readonly buckets: readonly BucketReport[];
  readonly grossTax: Decimal;
  readonly irrfWithheld: Decimal;
  readonly irrfUsed: Decimal;
  readonly irrfCreditCarryOut: Decimal;
  readonly netTax: Decimal;
  /** Saldo de meses anteriores que não atingiu o mínimo de R$ 10. */
  readonly darfCarryIn: Decimal;
  readonly darfPayable: Decimal;
  readonly darfCarryOut: Decimal;
  readonly darfDueDate: IsoDate | null;
  readonly darfCode: string;
}

interface Carry {
  loss: Record<TaxBucket, Decimal>;
  irrfCredit: Decimal;
  darf: Decimal;
}

const BUCKETS: readonly TaxBucket[] = ['SWING', 'DAY_TRADE', 'FII'];

function bucketOf(r: Realization): TaxBucket {
  if (r.assetClass === 'FII') return 'FII';
  return r.modality === 'DAY_TRADE' ? 'DAY_TRADE' : 'SWING';
}

function rateOf(bucket: TaxBucket): Decimal {
  switch (bucket) {
    case 'SWING':
      return TAX_RULES.swingRate;
    case 'DAY_TRADE':
      return TAX_RULES.dayTradeRate;
    case 'FII':
      return TAX_RULES.fiiRate;
  }
}

/** IRRF estimado por pregão, como a corretora retém. */
function irrfForMonth(realizations: readonly Realization[]): Decimal {
  const byDay = new Map<IsoDate, { swingSales: Decimal; dayTradeResult: Decimal }>();
  for (const r of realizations) {
    const day = byDay.get(r.date) ?? { swingSales: ZERO, dayTradeResult: ZERO };
    if (r.modality === 'SWING') day.swingSales = day.swingSales.plus(r.grossSales);
    else day.dayTradeResult = day.dayTradeResult.plus(r.result);
    byDay.set(r.date, day);
  }
  let total = ZERO;
  for (const day of byDay.values()) {
    const swing = toCents(day.swingSales.times(TAX_RULES.irrfSwingRate));
    if (swing.gte(TAX_RULES.irrfMinimum)) total = total.plus(swing);
    if (day.dayTradeResult.isPositive()) {
      const dt = toCents(day.dayTradeResult.times(TAX_RULES.irrfDayTradeRate));
      if (dt.gte(TAX_RULES.irrfMinimum)) total = total.plus(dt);
    }
  }
  return total;
}

/**
 * Apura o IR mês a mês desde a primeira venda, carregando prejuízos,
 * crédito de IRRF e DARFs abaixo do mínimo. Retorna só os meses do
 * ano pedido, mas o histórico anterior influencia o saldo.
 */
export function computeTaxReports(realizations: readonly Realization[], year: number): MonthlyTaxReport[] {
  if (realizations.length === 0) return [];

  const byMonth = new Map<YearMonth, Realization[]>();
  for (const r of realizations) {
    const ym = yearMonthOf(r.date);
    const list = byMonth.get(ym) ?? [];
    list.push(r);
    byMonth.set(ym, list);
  }

  const months = [...byMonth.keys()].sort();
  const first = months[0]!;
  const lastRequested = `${year}-12` as YearMonth;
  const carry: Carry = { loss: { SWING: ZERO, DAY_TRADE: ZERO, FII: ZERO }, irrfCredit: ZERO, darf: ZERO };
  const reports: MonthlyTaxReport[] = [];

  for (let ym = first; ym <= lastRequested; ym = nextYearMonth(ym)) {
    // Crédito de IRRF não usado só é compensável dentro do ano-calendário;
    // o saldo restante vai para a declaração de ajuste anual.
    if (ym.endsWith('-01')) carry.irrfCredit = ZERO;

    const monthRealizations = byMonth.get(ym) ?? [];
    if (monthRealizations.length === 0 && carry.darf.isZero()) continue;

    const report = computeMonth(ym, monthRealizations, carry);
    if (ym.startsWith(`${year}-`) && (monthRealizations.length > 0 || report.darfPayable.isPositive())) {
      reports.push(report);
    }
  }
  return reports;
}

function computeMonth(ym: YearMonth, realizations: readonly Realization[], carry: Carry): MonthlyTaxReport {
  const stockSwing = realizations.filter((r) => r.assetClass === 'STOCK' && r.modality === 'SWING');
  const stockSwingSales = sum(stockSwing.map((r) => r.grossSales));
  const stockSwingResult = sum(stockSwing.map((r) => r.result));
  const exemptionApplies = stockSwing.length > 0 && stockSwingSales.lte(TAX_RULES.stockExemptionLimit);
  // Só o lucro é isento; prejuízo continua compensável.
  const exemptStockProfit = exemptionApplies && stockSwingResult.isPositive() ? stockSwingResult : ZERO;

  const results: Record<TaxBucket, Decimal> = { SWING: ZERO, DAY_TRADE: ZERO, FII: ZERO };
  for (const r of realizations) {
    const bucket = bucketOf(r);
    results[bucket] = results[bucket].plus(r.result);
  }
  results.SWING = results.SWING.minus(exemptStockProfit);

  const buckets: BucketReport[] = BUCKETS.map((bucket) => {
    const monthResult = results[bucket];
    const lossCarryIn = carry.loss[bucket];
    let lossUsed = ZERO;
    let taxableBase = ZERO;
    let lossCarryOut = lossCarryIn;

    if (monthResult.isNegative()) {
      lossCarryOut = lossCarryIn.plus(monthResult.abs());
    } else if (monthResult.isPositive()) {
      lossUsed = lossCarryIn.lt(monthResult) ? lossCarryIn : monthResult;
      lossCarryOut = lossCarryIn.minus(lossUsed);
      taxableBase = monthResult.minus(lossUsed);
    }
    carry.loss[bucket] = lossCarryOut;

    const rate = rateOf(bucket);
    return Object.freeze({
      bucket,
      rate,
      monthResult,
      lossCarryIn,
      lossUsed,
      lossCarryOut,
      taxableBase,
      tax: toCents(taxableBase.times(rate)),
    });
  });

  const grossTax = sum(buckets.map((b) => b.tax));
  const irrfWithheld = irrfForMonth(realizations);
  const irrfAvailable = carry.irrfCredit.plus(irrfWithheld);
  const irrfUsed = irrfAvailable.lt(grossTax) ? irrfAvailable : grossTax;
  carry.irrfCredit = irrfAvailable.minus(irrfUsed);
  const netTax = grossTax.minus(irrfUsed);

  const darfCarryIn = carry.darf;
  const accumulated = darfCarryIn.plus(netTax);
  const payable = accumulated.gte(TAX_RULES.darfMinimum);
  carry.darf = payable ? ZERO : accumulated;

  return Object.freeze({
    month: ym,
    stockSwingSales,
    stockExemptionApplied: exemptionApplies,
    exemptStockProfit,
    buckets,
    grossTax,
    irrfWithheld,
    irrfUsed,
    irrfCreditCarryOut: carry.irrfCredit,
    netTax,
    darfCarryIn,
    darfPayable: payable ? accumulated : ZERO,
    darfCarryOut: carry.darf,
    darfDueDate: payable ? darfDueDate(ym) : null,
    darfCode: TAX_RULES.darfCode,
  });
}
