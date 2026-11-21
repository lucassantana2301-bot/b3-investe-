import type { Dec, IncomeEvent, IncomeMonthSummary, MonthlyTaxReport, PortfolioSummary, Trade } from '@b3pt/core';
import { formatMoney } from '@b3pt/core';

/**
 * Decimais saem como string no JSON: number em JS perderia precisão
 * e o front formata com Intl.NumberFormat.
 */
const money = (v: Dec) => formatMoney(v);
const ratio = (v: Dec) => v.toDecimalPlaces(6).toString();
const moneyOrNull = (v: Dec | null) => (v === null ? null : money(v));
const ratioOrNull = (v: Dec | null) => (v === null ? null : ratio(v));

export const serializeTrade = (t: Trade) => ({
  id: t.id,
  ticker: t.ticker,
  assetClass: t.assetClass,
  side: t.side,
  quantity: t.quantity,
  unitPrice: t.unitPrice.toFixed(),
  fees: money(t.fees),
  tradeDate: t.tradeDate,
  broker: t.broker,
});

export const serializeIncome = (e: IncomeEvent) => ({
  id: e.id,
  ticker: e.ticker,
  type: e.type,
  payerCnpj: e.payerCnpj,
  grossAmount: money(e.grossAmount),
  paymentDate: e.paymentDate,
});

export const serializeSummary = (s: PortfolioSummary) => ({
  positions: s.positions.map((p) => ({
    ticker: p.ticker,
    assetClass: p.assetClass,
    quantity: p.quantity,
    averagePrice: p.averagePrice.toDecimalPlaces(4).toFixed(4),
    totalCost: money(p.totalCost),
    price: moneyOrNull(p.price),
    marketValue: moneyOrNull(p.marketValue),
    unrealizedResult: moneyOrNull(p.unrealizedResult),
    unrealizedPercent: ratioOrNull(p.unrealizedPercent),
    weight: ratioOrNull(p.weight),
  })),
  totalCost: money(s.totalCost),
  marketValue: money(s.marketValue),
  unrealizedResult: money(s.unrealizedResult),
  realizedResult: money(s.realizedResult),
  incomeReceived: money(s.incomeReceived),
  allocation: Object.fromEntries(Object.entries(s.allocation).map(([k, v]) => [k, money(v)])),
  missingQuotes: s.missingQuotes,
  firstTradeDate: s.firstTradeDate,
  cdiReturn: s.cdiFactor ? ratio(s.cdiFactor.minus(1)) : null,
});

export const serializeTaxReport = (r: MonthlyTaxReport) => ({
  month: r.month,
  stockSwingSales: money(r.stockSwingSales),
  stockExemptionApplied: r.stockExemptionApplied,
  exemptStockProfit: money(r.exemptStockProfit),
  buckets: r.buckets.map((b) => ({
    bucket: b.bucket,
    rate: ratio(b.rate),
    monthResult: money(b.monthResult),
    lossCarryIn: money(b.lossCarryIn),
    lossUsed: money(b.lossUsed),
    lossCarryOut: money(b.lossCarryOut),
    taxableBase: money(b.taxableBase),
    tax: money(b.tax),
  })),
  grossTax: money(r.grossTax),
  irrfWithheld: money(r.irrfWithheld),
  irrfUsed: money(r.irrfUsed),
  netTax: money(r.netTax),
  darfCarryIn: money(r.darfCarryIn),
  darfPayable: money(r.darfPayable),
  darfCarryOut: money(r.darfCarryOut),
  darfDueDate: r.darfDueDate,
  darfCode: r.darfCode,
});

export const serializeIncomeSummary = (s: IncomeMonthSummary) => ({
  month: s.month,
  gross: money(s.gross),
  withheld: money(s.withheld),
  net: money(s.net),
  byType: Object.fromEntries(Object.entries(s.byType).map(([k, v]) => [k, money(v)])),
  payersOverThreshold: s.payersOverThreshold,
});
