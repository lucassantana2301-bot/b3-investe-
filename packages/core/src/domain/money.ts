import { Decimal } from 'decimal.js';
import { DomainError } from './errors.js';

/**
 * Aritmética decimal exata. Ponto flutuante (0.1 + 0.2) não serve para
 * preço médio e base de cálculo de imposto.
 */
export const Dec = Decimal.clone({ precision: 34, rounding: Decimal.ROUND_HALF_EVEN });
export type Dec = Decimal;

export type DecimalInput = Decimal.Value;

export function dec(value: DecimalInput): Decimal {
  return new Dec(value);
}

export const ZERO = dec(0);

/** Arredondamento bancário para centavos, usado apenas na saída. */
export function toCents(value: Decimal): Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/** Serializa com 2 casas para JSON/HTTP, sem perder precisão em notação científica. */
export function formatMoney(value: Decimal): string {
  return toCents(value).toFixed(2);
}

export function parseMoney(value: DecimalInput, field: string): Decimal {
  let parsed: Decimal;
  try {
    parsed = dec(value);
  } catch {
    throw new DomainError('INVALID_AMOUNT', `${field} não é um número válido`, { field, value: String(value) });
  }
  if (!parsed.isFinite()) {
    throw new DomainError('INVALID_AMOUNT', `${field} precisa ser finito`, { field });
  }
  return parsed;
}

export function sum(values: Iterable<Decimal>): Decimal {
  let total = ZERO;
  for (const v of values) total = total.plus(v);
  return total;
}
