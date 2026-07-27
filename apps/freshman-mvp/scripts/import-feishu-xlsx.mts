import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import type { QuestionIntent } from '../src/domain/models.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import {
  importWorkbook,
  parseWorkbookRows,
  readXlsxRows,
  type ImportExecutionReport,
} from '../src/services/content-importer.js';

interface Arguments {
  input: string;
  database: string;
  dryRun: boolean;
}

interface LegacyPreset {
  id: string;
  category: string;
  question: string;
  intentDescription: string;
  aliases?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
}

function parseArguments(argv: readonly string[]): Arguments {
  let input = '';
  let database = '';
  let dryRun = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (argument === '--input' || argument === '--database') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      if (argument === '--input') {
        input = value;
      } else {
        database = value;
      }
      index += 1;
      continue;
    }
    throw new Error(`Unknown argument: ${argument}`);
  }

  if (!input) {
    throw new Error('--input is required');
  }
  if (!database) {
    throw new Error('--database is required');
  }
  return { input, database, dryRun };
}

async function loadPresetIntents(appRoot: string): Promise<QuestionIntent[]> {
  const source = await readFile(path.join(appRoot, 'data', 'presets.json'), 'utf8');
  const parsed = JSON.parse(source) as { items?: LegacyPreset[] };
  if (!Array.isArray(parsed.items)) {
    throw new Error('data/presets.json must contain an items array');
  }

  return parsed.items.map((preset, index) => ({
    id: preset.id,
    externalId: null,
    category: preset.category,
    question: preset.question,
    intentDescription: preset.intentDescription,
    aliases: preset.aliases ?? [],
    keywords: preset.keywords ?? [],
    excludeKeywords: preset.excludeKeywords ?? [],
    active: true,
    featured: index < 10,
    displayOrder: index + 1,
  }));
}

async function ensureDatabaseOnDataDrive(databasePath: string): Promise<void> {
  const parent = await realpath(path.dirname(databasePath));
  if (path.parse(parent).root.toUpperCase() !== 'D:\\') {
    throw new Error(
      `Runtime database must resolve to the D: data drive; resolved parent was ${parent}`,
    );
  }
}

function printReport(report: unknown): void {
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
}

function dryRunSnapshotAudit(report: ImportExecutionReport): object {
  const priorPlanSnapshot = {
    questionCount: 35,
    acceptedAnswerCount: 34,
    rejectedAnswerCount: 34,
    residualCells: 'G3:G36',
  };
  const observed = {
    questionCount: report.questionCount,
    acceptedAnswerCount: report.acceptedAnswerCount,
    rejectedAnswerCount: report.rejectedAnswerCount,
    blankAnswerCount: report.skippedCells.filter((cell) => cell.reason === 'blank-answer').length,
    reservedQ11CellCount: report.skippedCells.filter(
      (cell) => cell.reason === 'reserved-question-q11',
    ).length,
    publishedCount: report.publishedCount,
  };
  const drift = priorPlanSnapshot.questionCount !== observed.questionCount
    || priorPlanSnapshot.acceptedAnswerCount !== observed.acceptedAnswerCount
    || priorPlanSnapshot.rejectedAnswerCount !== observed.rejectedAnswerCount;

  return {
    baseline: '2026-07-28 implementation-plan source snapshot',
    drift,
    priorPlanSnapshot,
    observed,
    note: drift
      ? 'The workbook changed after the implementation-plan snapshot. The observed report is authoritative; this dry run wrote no database rows. Run without --dry-run to import the current source.'
      : 'The workbook matches the implementation-plan snapshot; this dry run wrote no database rows.',
  };
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
  const appRoot = path.resolve(scriptDirectory, '..');
  const inputPath = path.resolve(process.cwd(), args.input);
  const databasePath = path.resolve(process.cwd(), args.database);
  const presetIntents = await loadPresetIntents(appRoot);

  if (args.dryRun) {
    const parsed = parseWorkbookRows(await readXlsxRows(inputPath), {
      existingIntents: presetIntents,
    });
    const report = { ...parsed, insertedRawAnswerCount: 0 };
    printReport({ ...report, snapshotAudit: dryRunSnapshotAudit(report) });
    return;
  }

  await ensureDatabaseOnDataDrive(databasePath);
  const database = openDatabase(databasePath);
  try {
    migrateDatabase(database);
    const repository = new SqliteContentRepository(database);
    const report = await importWorkbook(inputPath, repository, {
      existingIntents: presetIntents,
    });
    printReport(report);
  } finally {
    database.close();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Feishu workbook import failed: ${message}\n`);
  process.exitCode = 1;
});
