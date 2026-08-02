import path from 'node:path';
import { openDatabase } from '../src/db/sqlite.js';
import { createPostgresPool } from '../src/db/postgres.js';
import { migratePostgres } from '../src/db/postgres-migrations.js';
import { SqlitePostgresMigrator } from '../src/services/sqlite-postgres-migrator.js';

function readArgument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const sourcePath = readArgument('--source');
const postgresUrl = readArgument('--postgres-url') ?? process.env.POSTGRES_URL;
const dryRun = !process.argv.includes('--apply');
const reconcile = process.argv.includes('--reconcile');

if (!sourcePath || !postgresUrl) {
  throw new Error('Usage: tsx scripts/migrate-sqlite-to-postgres.mts --source <sqlite.db> --postgres-url <url> [--apply]');
}

const source = openDatabase(path.resolve(sourcePath));
try {
  const pool = await createPostgresPool(postgresUrl);
  try {
    if (!dryRun) {
      await migratePostgres(pool);
    }
    const report = await new SqlitePostgresMigrator(source, pool).migrate({ dryRun });
    const result = reconcile
      ? { report, reconciliation: await new SqlitePostgresMigrator(source, pool).reconcile() }
      : { report };
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } finally {
    await pool.end();
  }
} finally {
  source.close();
}
