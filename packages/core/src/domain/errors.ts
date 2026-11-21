export type DomainErrorCode =
  | 'INVALID_TICKER'
  | 'INVALID_QUANTITY'
  | 'INVALID_PRICE'
  | 'INVALID_DATE'
  | 'INVALID_AMOUNT'
  | 'INVALID_CNPJ'
  | 'INSUFFICIENT_POSITION'
  | 'ASSET_CLASS_CONFLICT'
  | 'NOT_FOUND';

/**
 * Erro de regra de negócio. A camada HTTP traduz para 4xx;
 * qualquer outro erro é tratado como falha de infraestrutura (5xx).
 */
export class DomainError extends Error {
  public readonly code: DomainErrorCode;
  public readonly details: Readonly<Record<string, unknown>>;

  constructor(code: DomainErrorCode, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}
