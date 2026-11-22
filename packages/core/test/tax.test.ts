import { describe, expect, it } from 'vitest';
import {
  darfDueDate,
  easterSunday,
  isBusinessDay,
  nationalBankHolidays,
  type IsoDate,
  type YearMonth,
} from '../src/domain/calendar.js';
import { buildLedger } from '../src/domain/ledger.js';
import { computeTaxReports } from '../src/domain/tax.js';
import { trade } from './helpers.js';

const reportsFor = (trades: Parameters<typeof buildLedger>[0], year = 2026) =>
  computeTaxReports(buildLedger(trades).realizations, year);

const bucket = (r: ReturnType<typeof reportsFor>[number], name: 'SWING' | 'DAY_TRADE' | 'FII') =>
  r.buckets.find((b) => b.bucket === name)!;

describe('computeTaxReports', () => {
  it('isenta lucro de ações quando as vendas do mês ficam até R$ 20 mil', () => {
    const [march] = reportsFor([
      trade('BUY', 'VALE3', 1000, '12', '2026-02-02'),
      trade('SELL', 'VALE3', 1000, '15', '2026-03-10'),
    ]);
    expect(march!.month).toBe('2026-03');
    expect(march!.stockExemptionApplied).toBe(true);
    expect(march!.exemptStockProfit.toFixed(2)).toBe('3000.00');
    expect(march!.grossTax.toFixed(2)).toBe('0.00');
    expect(march!.darfPayable.toFixed(2)).toBe('0.00');
  });

  it('tributa 15% acima de R$ 20 mil e desconta o IRRF de 0,005%', () => {
    const [feb] = reportsFor([
      trade('BUY', 'ITSA4', 2000, '10', '2026-01-05'),
      trade('SELL', 'ITSA4', 2000, '12', '2026-02-10'),
    ]);
    expect(feb!.stockExemptionApplied).toBe(false);
    expect(bucket(feb!, 'SWING').tax.toFixed(2)).toBe('600.00');
    expect(feb!.irrfWithheld.toFixed(2)).toBe('1.20');
    expect(feb!.darfPayable.toFixed(2)).toBe('598.80');
    expect(feb!.darfDueDate).toBe('2026-03-31');
  });

  it('compensa prejuízo anterior e crédito de IRRF não usado', () => {
    const [jan, feb] = reportsFor([
      trade('BUY', 'ABEV3', 2500, '10', '2026-01-02'),
      trade('SELL', 'ABEV3', 2500, '9.6', '2026-01-20'),
      trade('BUY', 'ABEV3', 2500, '10', '2026-02-02'),
      trade('SELL', 'ABEV3', 2500, '11.2', '2026-02-20'),
    ]);
    expect(bucket(jan!, 'SWING').lossCarryOut.toFixed(2)).toBe('1000.00');
    expect(jan!.irrfCreditCarryOut.toFixed(2)).toBe('1.20');

    expect(bucket(feb!, 'SWING').lossUsed.toFixed(2)).toBe('1000.00');
    expect(bucket(feb!, 'SWING').taxableBase.toFixed(2)).toBe('2000.00');
    expect(feb!.grossTax.toFixed(2)).toBe('300.00');
    expect(feb!.irrfUsed.toFixed(2)).toBe('2.60');
    expect(feb!.darfPayable.toFixed(2)).toBe('297.40');
  });

  it('não mistura prejuízo de FII com lucro de day trade', () => {
    const [april] = reportsFor([
      trade('BUY', 'HGLG11', 10, '160', '2026-04-01', { assetClass: 'FII' }),
      trade('SELL', 'HGLG11', 10, '110', '2026-04-15', { assetClass: 'FII' }),
      trade('BUY', 'PETR4', 1000, '30', '2026-04-15'),
      trade('SELL', 'PETR4', 1000, '31', '2026-04-15'),
    ]);
    expect(bucket(april!, 'FII').lossCarryOut.toFixed(2)).toBe('500.00');
    expect(bucket(april!, 'DAY_TRADE').tax.toFixed(2)).toBe('200.00');
    expect(april!.irrfWithheld.toFixed(2)).toBe('10.00');
    expect(april!.darfPayable.toFixed(2)).toBe('190.00');
  });

  it('ETF não tem isenção e DARF abaixo de R$ 10 é acumulado', () => {
    const [may, june] = reportsFor([
      trade('BUY', 'BOVA11', 100, '100', '2026-05-04', { assetClass: 'ETF' }),
      trade('SELL', 'BOVA11', 50, '101', '2026-05-20', { assetClass: 'ETF' }),
      trade('SELL', 'BOVA11', 50, '102', '2026-06-10', { assetClass: 'ETF' }),
    ]);
    expect(may!.stockExemptionApplied).toBe(false);
    expect(may!.netTax.toFixed(2)).toBe('7.50');
    expect(may!.darfPayable.toFixed(2)).toBe('0.00');
    expect(may!.darfCarryOut.toFixed(2)).toBe('7.50');

    expect(june!.darfCarryIn.toFixed(2)).toBe('7.50');
    expect(june!.darfPayable.toFixed(2)).toBe('22.50');
    expect(june!.darfDueDate).toBe('2026-07-31');
  });

  it('considera prejuízos de anos anteriores', () => {
    const reports = reportsFor(
      [
        trade('BUY', 'MGLU3', 3000, '10', '2025-11-03'),
        trade('SELL', 'MGLU3', 3000, '8', '2025-11-20'),
        trade('BUY', 'MGLU3', 3000, '10', '2026-01-05'),
        trade('SELL', 'MGLU3', 3000, '12', '2026-01-20'),
      ],
      2026,
    );
    expect(reports).toHaveLength(1);
    expect(bucket(reports[0]!, 'SWING').lossUsed.toFixed(2)).toBe('6000.00');
    expect(reports[0]!.grossTax.toFixed(2)).toBe('0.00');
  });
});

describe('darfDueDate', () => {
  it('cai no último dia útil do mês seguinte', () => {
    // Maio/2026 termina num domingo: vence sexta, 29/05.
    expect(darfDueDate('2026-04' as YearMonth)).toBe('2026-05-29');
    expect(darfDueDate('2026-12' as YearMonth)).toBe('2027-01-29');
  });
});

describe('calendário de dias úteis', () => {
  it('calcula a Páscoa em anos conhecidos', () => {
    expect(easterSunday(2024)).toBe('2024-03-31');
    expect(easterSunday(2026)).toBe('2026-04-05');
    expect(easterSunday(2028)).toBe('2028-04-16');
    expect(easterSunday(2029)).toBe('2029-04-01');
  });

  it('inclui feriados móveis e a Consciência Negra a partir de 2024', () => {
    const h2026 = nationalBankHolidays(2026);
    for (const date of ['2026-02-16', '2026-02-17', '2026-04-03', '2026-06-04', '2026-11-20']) {
      expect(h2026.has(date as IsoDate)).toBe(true);
    }
    expect(nationalBankHolidays(2023).has('2023-11-20' as IsoDate)).toBe(false);
    expect(isBusinessDay('2026-04-03' as IsoDate)).toBe(false);
    expect(isBusinessDay('2026-04-06' as IsoDate)).toBe(true);
  });

  it('antecipa o vencimento quando o último dia útil cai em feriado', () => {
    // 29/02/2028 é terça de Carnaval e 28/02 é segunda de Carnaval: vence na sexta, 25/02.
    expect(darfDueDate('2028-01' as YearMonth)).toBe('2028-02-25');
    // 31/03/2029 é sábado e 30/03 é Sexta-feira Santa: vence na quinta, 29/03.
    expect(darfDueDate('2029-02' as YearMonth)).toBe('2029-03-29');
  });
});
