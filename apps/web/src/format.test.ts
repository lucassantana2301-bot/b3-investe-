import { describe, expect, it } from 'vitest';
import { normalizeDecimal } from './components/TradeForm';
import { dateBr, monthLabel, signed } from './format';

describe('normalizeDecimal', () => {
  it.each([
    ['38,12', '38.12'],
    ['1.234,56', '1234.56'],
    ['38.12', '38.12'],
    [' 10 ', '10'],
  ])('%s -> %s', (input, expected) => {
    expect(normalizeDecimal(input)).toBe(expected);
  });
});

describe('format', () => {
  it('formata datas e meses em pt-BR', () => {
    expect(dateBr('2026-03-31')).toBe('31/03/2026');
    expect(monthLabel('2026-02')).toBe('fevereiro de 2026');
  });

  it('classifica sinal do resultado', () => {
    expect(signed('-1')).toBe('down');
    expect(signed('0.00')).toBe('flat');
    expect(signed(null)).toBe('flat');
  });
});
