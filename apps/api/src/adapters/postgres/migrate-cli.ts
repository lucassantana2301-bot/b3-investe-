import { loadConfig } from '../../config.js';
import { defaultMigrationsDir, migrate } from './migrate.js';
import { createPool } from './pool.js';

const config = loadConfig();
if (!config.DATABASE_URL) {
  console.error('DATABASE_URL não definido');
  process.exit(1);
}

const pool = createPool(config.DATABASE_URL, 1);
try {
  const applied = await migrate(pool, defaultMigrationsDir());
  console.log(applied.length ? `${applied.length} migration(s) aplicada(s)` : 'Banco já está atualizado');
} catch (error) {
  console.error((error as Error).message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
