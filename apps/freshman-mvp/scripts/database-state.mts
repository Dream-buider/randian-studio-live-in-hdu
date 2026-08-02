import { mkdir, realpath } from 'node:fs/promises';
import path from 'node:path';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';

function parseDatabasePath(argv: readonly string[]): string {
  if (argv.length !== 2 || argv[0] !== '--database' || !argv[1]) {
    throw new Error('usage: database-state.mts --database <path>');
  }
  return path.resolve(argv[1]);
}

async function main(): Promise<void> {
  const databasePath = parseDatabasePath(process.argv.slice(2));
  await mkdir(path.dirname(databasePath), { recursive: true });
  const parent = await realpath(path.dirname(databasePath));
  if (path.parse(parent).root.toUpperCase() !== 'D:\\') {
    throw new Error('database must resolve to D:');
  }
  const database = openDatabase(databasePath);
  try {
    migrateDatabase(database);
    const counts = {
      intents: Number((database.prepare(
        'SELECT COUNT(*) AS count FROM question_intents',
      ).get() as { count: number }).count),
      rawAnswers: Number((database.prepare(
        'SELECT COUNT(*) AS count FROM raw_answers',
      ).get() as { count: number }).count),
      published: Number((database.prepare(
        "SELECT COUNT(*) AS count FROM canonical_answers WHERE status = 'published'",
      ).get() as { count: number }).count),
      pendingReviews: Number((database.prepare(
        "SELECT COUNT(*) AS count FROM review_tasks WHERE status = 'pending'",
      ).get() as { count: number }).count),
      q11RawAnswers: Number((database.prepare(`
        SELECT COUNT(*) AS count
        FROM raw_answers raw
        JOIN question_intents intent ON intent.id = raw.intent_id
        WHERE intent.external_id = 'Q11'
      `).get() as { count: number }).count),
      q11Published: Number((database.prepare(`
        SELECT COUNT(*) AS count
        FROM canonical_answers answer
        JOIN question_intents intent ON intent.id = answer.intent_id
        WHERE intent.external_id = 'Q11'
          AND answer.status = 'published'
      `).get() as { count: number }).count),
      invalidNumericRawAnswers: Number((database.prepare(`
        SELECT COUNT(*) AS count
        FROM raw_answers
        WHERE TRIM(answer_text) GLOB '[0-9]'
           OR TRIM(answer_text) GLOB '[0-9][0-9]'
      `).get() as { count: number }).count),
    };
    process.stdout.write(`${JSON.stringify({ databasePath, counts })}\n`);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Database state failed: ${
    error instanceof Error ? error.message : String(error)
  }\n`);
  process.exitCode = 1;
});
