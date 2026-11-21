import { DomainError } from './errors.js';

/**
 * Classe do ativo define a regra tributária. Não é inferida do ticker:
 * final "11" pode ser FII, ETF ou unit (ex.: TAEE11 é ação), então o
 * usuário informa explicitamente.
 */
export const ASSET_CLASSES = ['STOCK', 'FII', 'ETF', 'BDR'] as const;
export type AssetClass = (typeof ASSET_CLASSES)[number];

export type Ticker = string & { readonly __brand: 'Ticker' };

// 4 letras + 1-2 dígitos; sufixo F do mercado fracionário é normalizado.
const TICKER = /^([A-Z]{4})(\d{1,2})F?$/;

export function parseTicker(raw: string): Ticker {
  const value = raw.trim().toUpperCase();
  const match = TICKER.exec(value);
  if (!match) {
    throw new DomainError('INVALID_TICKER', 'Ticker inválido para a B3 (ex.: PETR4, HGLG11)', { value: raw });
  }
  return `${match[1]}${match[2]}` as Ticker;
}

export function isAssetClass(value: unknown): value is AssetClass {
  return typeof value === 'string' && (ASSET_CLASSES as readonly string[]).includes(value);
}
