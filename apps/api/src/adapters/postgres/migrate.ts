import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';

/**
 * Runner de migrations mínimo e transacional:
 *  - aplica arquivos NNN_nome.sql em ordem lexicográfica;
 *  - cada arquivo roda numa transação e é registrado em schema_migrations;
 *  - advisory lock impede duas instâncias migrando ao mesmo tempo.
 */
const LOCK_ID = 7_301_337;

export async function migrate(
  pool: pg.Pool,
  migrationsDir: string,
  log: (msg: string) => void = console.log,
): Promise<string[]> {
  const files = (await readdir(migrationsDir)).filter((f) => /^\d{3}_[\w-]+\.sql$/.test(f)).sort();
  const client = await pool.connect();
  const applied: string[] = [];
  try {
    await client.query('SELECT pg_advisory_lock($1)', [LOCK_ID]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name       TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`);
    const done = new Set(
      (await client.query<{ name: string }>('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
    );

    for (const file of files) {
      if (done.has(file)) continue;
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      try {
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`Falha na migration ${file}: ${(error as Error).message}`, { cause: error });
      }
      applied.push(file);
      log(`migration aplicada: ${file}`);
    }
    return applied;
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [LOCK_ID]).catch(() => undefined);
    client.release();
  }
}

export function defaultMigrationsDir(): string {
  return process.env.MIGRATIONS_DIR ?? path.resolve(process.cwd(), '../../db/migrations/postgres');
}
