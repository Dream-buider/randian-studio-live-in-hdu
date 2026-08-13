import type { SqliteDatabase } from '../db/sqlite.js';
import type { PostgresClient, PostgresPool } from '../db/postgres.js';

const TABLES = [
  'question_intents',
  'intent_aliases',
  'raw_answers',
  'canonical_answers',
  'canonical_answer_sources',
  'review_tasks',
  'conversations',
  'feedback',
  'app_settings',
] as const;

type TableName = typeof TABLES[number];
type Row = Record<string, unknown>;

const CONFLICT_KEYS: Record<TableName, readonly string[]> = {
  question_intents: ['id'],
  intent_aliases: ['intent_id', 'alias'],
  raw_answers: ['id'],
  canonical_answers: ['id'],
  canonical_answer_sources: ['canonical_answer_id', 'position'],
  review_tasks: ['id'],
  conversations: ['id'],
  feedback: ['id'],
  app_settings: ['key'],
};

export interface SqlitePostgresMigrationOptions { dryRun?: boolean; }
export interface SqlitePostgresMigrationReport {
  dryRun: boolean;
  sourceCounts: Record<TableName, number>;
  transferredCounts: Record<TableName, number>;
  transferredTotal: number;
  q11IntentCount: number;
  suspiciousRawAnswerIds: string[];
}

export interface SqlitePostgresReconciliation {
  sourceCounts: Record<TableName, number>;
  targetCounts: Record<TableName, number>;
  matches: boolean;
}

function emptyCounts(): Record<TableName, number> {
  return Object.fromEntries(TABLES.map((table) => [table, 0])) as Record<TableName, number>;
}

function rowsFor(source: SqliteDatabase, table: TableName): Row[] {
  return source.prepare(`SELECT * FROM ${table}`).all() as Row[];
}

function insertStatement(table: TableName, row: Row): { text: string; values: unknown[] } {
  const columns = Object.keys(row);
  const values = columns.map((column) => row[column]);
  const placeholders = columns.map((_column, index) => `$${index + 1}`).join(', ');
  const keys = CONFLICT_KEYS[table];
  const mutable = columns.filter((column) => !keys.includes(column));
  const conflict = mutable.length === 0
    ? `ON CONFLICT (${keys.join(', ')}) DO NOTHING`
    : `ON CONFLICT (${keys.join(', ')}) DO UPDATE SET ${
      mutable.map((column) => `${column} = EXCLUDED.${column}`).join(', ')
    } WHERE ${
      mutable.map((column) => `${table}.${column} IS DISTINCT FROM EXCLUDED.${column}`).join(' OR ')
    }`;
  return { text: `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${placeholders}) ${conflict}`, values };
}

export class SqlitePostgresMigrator {
  private readonly source: SqliteDatabase;
  private readonly target: PostgresPool;

  constructor(source: SqliteDatabase, target: PostgresPool) {
    this.source = source;
    this.target = target;
  }

  async reconcile(): Promise<SqlitePostgresReconciliation> {
    const sourceCounts = emptyCounts();
    const targetCounts = emptyCounts();
    for (const table of TABLES) {
      sourceCounts[table] = rowsFor(this.source, table).length;
      const result = await this.target.query(`SELECT COUNT(*)::int AS count FROM ${table}`);
      targetCounts[table] = Number(result.rows[0]?.count ?? 0);
    }
    return {
      sourceCounts,
      targetCounts,
      matches: TABLES.every((table) => sourceCounts[table] === targetCounts[table]),
    };
  }

  async migrate(options: SqlitePostgresMigrationOptions = {}): Promise<SqlitePostgresMigrationReport> {
    const snapshots = Object.fromEntries(TABLES.map((table) => [table, rowsFor(this.source, table)])) as Record<TableName, Row[]>;
    const sourceCounts = emptyCounts();
    const transferredCounts = emptyCounts();
    for (const table of TABLES) sourceCounts[table] = snapshots[table].length;

    const intentsById = new Map(snapshots.question_intents.map((row) => [String(row.id), row]));
    const q11IntentCount = snapshots.question_intents.filter((row) => String(row.external_id ?? '').toUpperCase() === 'Q11').length;
    const suspiciousRawAnswerIds = snapshots.raw_answers
      .filter((row) => /^\d{1,2}$/.test(String(row.answer_text ?? '').trim()))
      .map((row) => String(row.id));
    for (const row of snapshots.raw_answers) {
      const intent = intentsById.get(String(row.intent_id));
      if (String(intent?.external_id ?? '').toUpperCase() === 'Q11' && row.answer_text === null) {
        throw new Error('Q11 evidence row must not contain a null answer');
      }
    }

    if (options.dryRun) {
      return { dryRun: true, sourceCounts, transferredCounts, transferredTotal: 0, q11IntentCount, suspiciousRawAnswerIds };
    }

    const client = await this.target.connect();
    try {
      await client.query('BEGIN');
      for (const table of TABLES) {
        for (const row of snapshots[table]) {
          const statement = insertStatement(table, row);
          const result = await client.query(statement.text, statement.values);
          transferredCounts[table] += result.rowCount ?? 0;
        }
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return {
      dryRun: false,
      sourceCounts,
      transferredCounts,
      transferredTotal: Object.values(transferredCounts).reduce((total, value) => total + value, 0),
      q11IntentCount,
      suspiciousRawAnswerIds,
    };
  }
}
