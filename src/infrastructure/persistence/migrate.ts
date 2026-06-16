import { config as loadDotenv } from 'dotenv';
loadDotenv({ path: '.env.local' });
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { createPool } from './pool.js';
import { loadEnv } from '../config/env.js';

/** Minimal forward-only migration runner. Tracks applied files in schema_migrations. */
async function main(): Promise<void> {
  const env = loadEnv();
  const pool = createPool(env.DATABASE_URL);
  const dir = resolve(process.cwd(), 'db/migrations');

  await pool.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())',
  );
  const done = new Set(
    (await pool.query<{ filename: string }>('SELECT filename FROM schema_migrations')).rows.map(
      (r) => r.filename,
    ),
  );

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    if (done.has(file)) {
      console.warn(`skip  ${file}`);
      continue;
    }
    const sql = await readFile(join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.warn(`apply ${file}`);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
  await pool.end();
  console.warn('migrations complete.');
}

main().catch((e: unknown) => {
  console.error('migration failed:', e);
  process.exit(1);
});
