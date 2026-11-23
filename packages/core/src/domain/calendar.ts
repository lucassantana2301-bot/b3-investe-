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

const DAY_MS = 86_400_000;

/** Domingo de Páscoa (algoritmo anônimo gregoriano, válido para qualquer ano do calendário gregoriano). */
export function easterSunday(year: number): IsoDate {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return toIso(Date.UTC(year, month - 1, day));
}

function toIso(epochMs: number): IsoDate {
  return new Date(epochMs).toISOString().slice(0, 10) as IsoDate;
}

function shift(date: IsoDate, days: number): IsoDate {
  return toIso(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS);
}

/**
 * Dias sem expediente bancário em todo o país: feriados nacionais fixos (inclui o Dia da
 * Consciência Negra, nacional desde 2024 pela Lei 14.759/2023) e as datas móveis que fecham
 * os bancos: segunda e terça de Carnaval, Sexta-feira Santa e Corpus Christi.
 */
export function nationalBankHolidays(year: number): ReadonlySet<IsoDate> {
  const fixed = ['01-01', '04-21', '05-01', '09-07', '10-12', '11-02', '11-15', '12-25'];
  if (year >= 2024) fixed.push('11-20');
  const easter = easterSunday(year);
  return new Set<IsoDate>([
    ...fixed.map((md) => `${year}-${md}` as IsoDate),
    shift(easter, -48), // segunda de Carnaval
    shift(easter, -47), // terça de Carnaval
    shift(easter, -2), // Sexta-feira Santa
    shift(easter, 60), // Corpus Christi
  ]);
}

export function isBusinessDay(date: IsoDate): boolean {
  const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
  if (weekday === 0 || weekday === 6) return false;
  return !nationalBankHolidays(Number(date.slice(0, 4))).has(date);
}

/**
 * Vencimento do DARF: último dia útil do mês seguinte à apuração, desconsiderando fins de
 * semana e feriados bancários nacionais. Feriados estaduais e municipais não entram, porque
 * o recolhimento pode ser feito em qualquer praça. Confira sempre no Sicalc da Receita.
 */
export function darfDueDate(ym: YearMonth): IsoDate {
  const [y, m] = nextYearMonth(ym).split('-').map(Number) as [number, number];
  let date = toIso(Date.UTC(y, m, 0)); // dia 0 do mês seguinte = último dia de m
  while (!isBusinessDay(date)) date = shift(date, -1);
  return date;
}

export function compareIsoDate(a: IsoDate, b: IsoDate): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
