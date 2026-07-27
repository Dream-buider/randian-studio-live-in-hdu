import { DatabaseSync } from 'node:sqlite';
import {
  copyFile,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';

export interface DatabaseSnapshot {
  integrity: 'ok';
  counts: {
    intents: number;
    canonicalVersions: number;
    reviews: number;
    settings: number;
  };
}

export interface BackupOptions {
  databasePath: string;
  outputDirectory: string;
  retain?: number;
  now?: Date;
  filenamePrefix?: string;
}

export interface BackupResult extends DatabaseSnapshot {
  backupPath: string;
  removedPaths: string[];
}

export interface RestoreOptions {
  backupPath: string;
  databasePath: string;
  pidFile: string;
  safetyBackupDirectory: string;
  now?: Date;
}

export interface RestoreResult extends DatabaseSnapshot {
  databasePath: string;
  safetyBackupPath: string | null;
}

interface PidMetadata {
  pid?: unknown;
}

function sqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function utcFileTimestamp(now: Date): string {
  return now.toISOString().replaceAll(':', '-').replace('.', '-');
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await stat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return false;
    }
    throw error;
  }
}

async function assertResolvedDataDrive(filePath: string, label: string): Promise<void> {
  const resolved = await realpath(filePath);
  if (path.parse(resolved).root.toUpperCase() !== 'D:\\') {
    throw new Error(`${label} must resolve to D:`);
  }
}

function tableCount(database: DatabaseSync, table: string): number {
  const row = database.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get() as {
    count: number | bigint;
  };
  return Number(row.count);
}

export async function inspectDatabase(databasePath: string): Promise<DatabaseSnapshot> {
  const database = new DatabaseSync(databasePath, { readOnly: true });
  try {
    const integrityRows = database.prepare('PRAGMA integrity_check').all() as Array<{
      integrity_check: string;
    }>;
    if (
      integrityRows.length !== 1
      || String(integrityRows[0]?.integrity_check).toLowerCase() !== 'ok'
    ) {
      throw new Error(`SQLite integrity check failed for ${databasePath}`);
    }
    return {
      integrity: 'ok',
      counts: {
        intents: tableCount(database, 'question_intents'),
        canonicalVersions: tableCount(database, 'canonical_answers'),
        reviews: tableCount(database, 'review_tasks'),
        settings: tableCount(database, 'app_settings'),
      },
    };
  } finally {
    database.close();
  }
}

async function pruneBackups(
  outputDirectory: string,
  filenamePrefix: string,
  retain: number,
): Promise<string[]> {
  const matcher = new RegExp(`^${filenamePrefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}-.*\\.db$`);
  const files = (await readdir(outputDirectory))
    .filter((name) => matcher.test(name))
    .sort()
    .reverse();
  const removedPaths: string[] = [];
  for (const name of files.slice(retain)) {
    const filePath = path.join(outputDirectory, name);
    await rm(filePath, { force: true });
    removedPaths.push(filePath);
  }
  return removedPaths;
}

export async function backupDatabase(options: BackupOptions): Promise<BackupResult> {
  const databasePath = path.resolve(options.databasePath);
  const outputDirectory = path.resolve(options.outputDirectory);
  const retain = options.retain ?? 14;
  const filenamePrefix = options.filenamePrefix ?? 'live-in-hdu';
  if (!Number.isInteger(retain) || retain < 1) {
    throw new Error('retain must be a positive integer');
  }
  await mkdir(outputDirectory, { recursive: true });
  await assertResolvedDataDrive(databasePath, 'database');
  await assertResolvedDataDrive(outputDirectory, 'backup directory');
  const backupPath = path.join(
    outputDirectory,
    `${filenamePrefix}-${utcFileTimestamp(options.now ?? new Date())}.db`,
  );
  await rm(backupPath, { force: true });

  const database = new DatabaseSync(databasePath);
  try {
    database.exec('PRAGMA busy_timeout = 5000');
    database.exec(`VACUUM INTO ${sqlString(backupPath)}`);
  } finally {
    database.close();
  }

  const snapshot = await inspectDatabase(backupPath);
  const removedPaths = await pruneBackups(outputDirectory, filenamePrefix, retain);
  return { backupPath, removedPaths, ...snapshot };
}

function processIsAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function assertDatabaseIsStopped(pidFile: string): Promise<void> {
  if (!(await exists(pidFile))) {
    return;
  }
  let metadata: PidMetadata;
  try {
    metadata = JSON.parse(await readFile(pidFile, 'utf8')) as PidMetadata;
  } catch {
    throw new Error(`Cannot validate PID metadata: ${pidFile}`);
  }
  const pid = Number(metadata.pid);
  if (Number.isInteger(pid) && pid > 0 && processIsAlive(pid)) {
    throw new Error(`Refusing restore while the recorded running process ${pid} is alive`);
  }
}

export async function restoreDatabase(options: RestoreOptions): Promise<RestoreResult> {
  const backupPath = path.resolve(options.backupPath);
  const databasePath = path.resolve(options.databasePath);
  const pidFile = path.resolve(options.pidFile);
  const safetyBackupDirectory = path.resolve(options.safetyBackupDirectory);
  await mkdir(path.dirname(databasePath), { recursive: true });
  await mkdir(safetyBackupDirectory, { recursive: true });
  await assertResolvedDataDrive(backupPath, 'restore source');
  await assertResolvedDataDrive(path.dirname(databasePath), 'database parent');
  await assertResolvedDataDrive(safetyBackupDirectory, 'safety backup directory');
  await assertDatabaseIsStopped(pidFile);
  await inspectDatabase(backupPath);

  let safetyBackupPath: string | null = null;
  if (await exists(databasePath)) {
    const safety = await backupDatabase({
      databasePath,
      outputDirectory: safetyBackupDirectory,
      retain: 14,
      now: options.now,
      filenamePrefix: 'safety-before-restore',
    });
    safetyBackupPath = safety.backupPath;
  }

  const stagingPath = `${databasePath}.restore-${process.pid}.tmp`;
  await copyFile(backupPath, stagingPath);
  await inspectDatabase(stagingPath);
  await rm(`${databasePath}-wal`, { force: true });
  await rm(`${databasePath}-shm`, { force: true });
  await rm(databasePath, { force: true });
  await rename(stagingPath, databasePath);

  const restored = openDatabase(databasePath);
  try {
    migrateDatabase(restored);
  } finally {
    restored.close();
  }
  const snapshot = await inspectDatabase(databasePath);
  return { databasePath, safetyBackupPath, ...snapshot };
}

interface CliArguments {
  databasePath: string;
  outputDirectory: string;
  restorePath: string | null;
  pidFile: string;
  retain: number;
}

function parseArguments(argv: readonly string[]): CliArguments {
  let databasePath = '';
  let outputDirectory = '';
  let restorePath: string | null = null;
  let pidFile = '';
  let retain = 14;
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--database', '--output', '--restore', '--pid-file', '--retain'].includes(key)) {
      throw new Error(`Unknown argument: ${key}`);
    }
    if (!value || value.startsWith('--')) {
      throw new Error(`${key} requires a value`);
    }
    if (key === '--database') databasePath = value;
    if (key === '--output') outputDirectory = value;
    if (key === '--restore') restorePath = value;
    if (key === '--pid-file') pidFile = value;
    if (key === '--retain') retain = Number(value);
    index += 1;
  }
  if (!databasePath || !outputDirectory) {
    throw new Error('--database and --output are required');
  }
  if (restorePath && !pidFile) {
    throw new Error('--pid-file is required for restore');
  }
  return { databasePath, outputDirectory, restorePath, pidFile, retain };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const result = args.restorePath
    ? await restoreDatabase({
      backupPath: args.restorePath,
      databasePath: args.databasePath,
      pidFile: args.pidFile,
      safetyBackupDirectory: args.outputDirectory,
    })
    : await backupDatabase({
      databasePath: args.databasePath,
      outputDirectory: args.outputDirectory,
      retain: args.retain,
    });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  main().catch((error: unknown) => {
    process.stderr.write(`SQLite backup/restore failed: ${
      error instanceof Error ? error.message : String(error)
    }\n`);
    process.exitCode = 1;
  });
}
