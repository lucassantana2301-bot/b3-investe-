import pg from 'pg';

const DATE_OID = 1082;
const NUMERIC_OID = 1700;

/**
 * Parsers por pool (não globais):
 *  - DATE volta como string 'YYYY-MM-DD'. O padrão do node-postgres cria um
 *    Date local e pode deslocar o dia conforme o fuso do servidor.
 *  - NUMERIC volta como string para virar Decimal sem perder precisão.
 */
const typeOverrides: pg.CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') => {
    if (oid === DATE_OID || oid === NUMERIC_OID) return (value: string) => value;
    return pg.types.getTypeParser(oid, format);
  }) as pg.CustomTypesConfig['getTypeParser'],
};

export function createPool(connectionString: string, max: number): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max,
    types: typeOverrides,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 15_000,
    application_name: 'b3-portfolio-tracker',
  });
  // Erro em cliente ocioso (ex.: banco reiniciado) não pode derrubar o processo.
  pool.on('error', (err) => {
    console.error('[pg] erro em conexão ociosa', err.message);
  });
  return pool;
}
