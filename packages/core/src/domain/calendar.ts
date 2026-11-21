import { DomainError } from './errors.js';

/** Data de pregão no formato ISO (YYYY-MM-DD), sem fuso: evita deslocar o dia na conversão UTC. */
export type IsoDate = string & { readonly __brand: 'IsoDate' };
/** Competência mensal (YYYY-MM). */
export type YearMonth = string & { readonly __brand: 'YearMonth' };

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseIsoDate(value: string): IsoDate {
  const match = ISO_DATE.exec(value);
  if (!match) {
    throw new DomainError('INVALID_DATE', 'Data deve estar no formato YYYY-MM-DD', { value });
  }
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (date.getUTCFullYear() !== Number(y) || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) {
    throw new DomainError('INVALID_DATE', 'Data inexistente no calendário', { value });
  }
  return value as IsoDate;
}

export function yearMonthOf(date: IsoDate): YearMonth {
  return date.slice(0, 7) as YearMonth;
}

export function nextYearMonth(ym: YearMonth): YearMonth {
  const [y, m] = ym.split('-').map(Number) as [number, number];
  const next = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  return `${next.y}-${String(next.m).padStart(2, '0')}` as YearMonth;
}

/**
 * Vencimento do DARF: último dia útil do mês seguinte à apuração.
 * Considera apenas fins de semana; feriados nacionais devem ser
 * conferidos no Sicalc da Receita.
 */
export function darfDueDate(ym: YearMonth): IsoDate {
  const [y, m] = nextYearMonth(ym).split('-').map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m, 0)); // dia 0 do mês seguinte = último dia de m
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() - 1);
  }
  return date.toISOString().slice(0, 10) as IsoDate;
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
