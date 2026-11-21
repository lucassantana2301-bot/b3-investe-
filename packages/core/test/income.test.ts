import { describe, expect, it } from 'vitest';
import { DomainError } from '../src/domain/errors.js';
import { createIncome, isValidCnpj, summarizeIncome } from '../src/domain/income.js';

const PETROBRAS = '33.000.167/0001-01';

describe('isValidCnpj', () => {
  it('aceita CNPJ válido e rejeita dígito errado ou repetido', () => {
    expect(isValidCnpj('33000167000101')).toBe(true);
    expect(isValidCnpj('33000167000102')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });
});

describe('summarizeIncome', () => {
  it('retém 10% sobre o total quando a mesma empresa paga mais de R$ 50 mil no mês', () => {
    const [summary] = summarizeIncome([
      createIncome({
        id: '1',
        ticker: 'PETR4',
        type: 'DIVIDEND',
        payerCnpj: PETROBRAS,
        grossAmount: '30000',
        paymentDate: '2026-05-20',
      }),
      createIncome({
        id: '2',
        ticker: 'PETR3',
        type: 'DIVIDEND',
        payerCnpj: PETROBRAS,
        grossAmount: '30000',
        paymentDate: '2026-05-28',
      }),
    ]);
    expect(summary!.payersOverThreshold).toEqual(['33000167000101']);
    expect(summary!.withheld.toFixed(2)).toBe('6000.00');
    expect(summary!.net.toFixed(2)).toBe('54000.00');
  });

  it('não retém dividendos até R$ 50 mil e retém 15% de JCP', () => {
    const [summary] = summarizeIncome([
      createIncome({ id: '1', ticker: 'ITUB4', type: 'DIVIDEND', grossAmount: '50000', paymentDate: '2026-06-01' }),
      createIncome({ id: '2', ticker: 'ITUB4', type: 'JCP', grossAmount: '1000', paymentDate: '2026-06-01' }),
      createIncome({ id: '3', ticker: 'HGLG11', type: 'FII_INCOME', grossAmount: '120', paymentDate: '2026-06-15' }),
    ]);
    expect(summary!.payersOverThreshold).toEqual([]);
    expect(summary!.withheld.toFixed(2)).toBe('150.00');
    expect(summary!.byType.FII_INCOME.toFixed(2)).toBe('120.00');
  });

  it('valida CNPJ e valor', () => {
    expect(() =>
      createIncome({
        id: '1',
        ticker: 'PETR4',
        type: 'DIVIDEND',
        payerCnpj: '123',
        grossAmount: '10',
        paymentDate: '2026-01-02',
      }),
    ).toThrowError(DomainError);
    expect(() =>
      createIncome({ id: '1', ticker: 'PETR4', type: 'DIVIDEND', grossAmount: '-1', paymentDate: '2026-01-02' }),
    ).toThrowError(DomainError);
  });
});
