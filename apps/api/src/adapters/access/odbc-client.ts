/**
 * Abstração mínima sobre o driver ODBC. O pacote `odbc` é opcional
 * (binário nativo que só faz sentido no Windows com o Access Database
 * Engine instalado), então é carregado sob demanda.
 */
export type OdbcParam = string | number | null;

export interface OdbcClient {
  query<T extends object>(sql: string, params?: readonly OdbcParam[]): Promise<T[]>;
  close(): Promise<void>;
}

interface OdbcPoolLike {
  query(sql: string, params?: OdbcParam[]): Promise<unknown[]>;
  close(): Promise<void>;
}

interface OdbcModule {
  pool(options: { connectionString: string; initialSize?: number; maxSize?: number }): Promise<OdbcPoolLike>;
}

export async function createOdbcClient(connectionString: string): Promise<OdbcClient> {
  let odbc: OdbcModule;
  try {
    // Especificador em variável: o TypeScript não exige os tipos de um pacote opcional
    // que não está instalado no Linux/CI.
    const moduleName = 'odbc';
    const mod = (await import(moduleName)) as { default?: OdbcModule } & OdbcModule;
    odbc = mod.default ?? mod;
  } catch (error) {
    throw new Error(
      'Pacote "odbc" indisponível. No Windows, instale o Microsoft Access Database Engine (x64) ' +
        'e rode "npm install odbc" em apps/api.',
      { cause: error },
    );
  }

  // O Access trabalha com um escritor por vez: pool pequeno evita lock do arquivo .accdb.
  const pool = await odbc.pool({ connectionString, initialSize: 1, maxSize: 2 });
  return {
    async query<T extends object>(sql: string, params: readonly OdbcParam[] = []): Promise<T[]> {
      const rows = await pool.query(sql, [...params]);
      // node-odbc anexa metadados (count, columns, statement) ao array: copiamos só as linhas.
      return Array.from(rows) as T[];
    },
    close: () => pool.close(),
  };
}
