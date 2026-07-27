import { createHash } from 'node:crypto';
import type { QuestionIntent, RawAnswer } from '../domain/models.js';
import type { ContentRepository } from '../repositories/contracts.js';

const REQUIRED_HEADERS = ['问题编号', '问题分类', '新生问题', '回答要点'] as const;

export type WorkbookRows = ReadonlyArray<ReadonlyArray<unknown>>;
export type WorkbookRowReader = (workbookPath: string) => Promise<WorkbookRows>;

export interface RejectedWorkbookCell {
  row: number;
  column: number;
  cell: string;
  header: string;
  value: unknown;
  reason: 'residual-demographic-value';
}

export interface SkippedWorkbookCell {
  row: number;
  column: number;
  cell: string;
  header: string;
  value: unknown;
  reason: 'blank-answer' | 'reserved-question-q11';
}

export interface ImportReport {
  questionCount: number;
  acceptedAnswerCount: number;
  rejectedAnswerCount: number;
  publishedCount: 0;
  intents: QuestionIntent[];
  rawAnswers: RawAnswer[];
  rejectedCells: RejectedWorkbookCell[];
  skippedCells: SkippedWorkbookCell[];
}

export interface ImportExecutionReport extends ImportReport {
  insertedRawAnswerCount: number;
}

export interface ParseWorkbookOptions {
  existingIntents?: readonly QuestionIntent[];
  importedAt?: string;
}

export interface ImportWorkbookOptions extends ParseWorkbookOptions {
  readRows?: WorkbookRowReader;
  dryRun?: boolean;
}

function normalizeText(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value).trim();
}

function isBlank(value: unknown): boolean {
  return normalizeText(value) === '';
}

function columnName(column: number): string {
  let value = column;
  let result = '';
  while (value > 0) {
    value -= 1;
    result = String.fromCharCode(65 + (value % 26)) + result;
    value = Math.floor(value / 26);
  }
  return result;
}

function cellAddress(row: number, column: number): string {
  return `${columnName(column)}${row}`;
}

function isAnswerHeader(header: string): boolean {
  return header !== '回答要点'
    && (header.startsWith('学长学姐回答') || header.startsWith('回答'));
}

function rawAnswerFingerprint(intentId: string, sourceLabel: string, answer: string): string {
  return createHash('sha256')
    .update(`${intentId}\0${sourceLabel}\0${answer}`, 'utf8')
    .digest('hex');
}

function normalizeExternalId(value: unknown, row: number): string {
  const externalId = normalizeText(value);
  if (!externalId) {
    throw new Error(`Invalid workbook row ${row}: 问题编号 is blank`);
  }
  return externalId;
}

function requiredText(value: unknown, header: string, row: number): string {
  const result = normalizeText(value);
  if (!result) {
    throw new Error(`Invalid workbook row ${row}: ${header} is blank`);
  }
  return result;
}

function newIntentId(externalId: string): string {
  return `q-${externalId.toLowerCase()}`;
}

function createIntent(
  row: ReadonlyArray<unknown>,
  rowNumber: number,
  displayOrder: number,
  indexes: ReadonlyMap<string, number>,
  existingByQuestion: ReadonlyMap<string, QuestionIntent>,
): QuestionIntent {
  const externalId = normalizeExternalId(row[indexes.get('问题编号')!], rowNumber);
  const category = requiredText(row[indexes.get('问题分类')!], '问题分类', rowNumber);
  const question = requiredText(row[indexes.get('新生问题')!], '新生问题', rowNumber);
  const intentDescription = requiredText(row[indexes.get('回答要点')!], '回答要点', rowNumber);
  const existing = existingByQuestion.get(question);

  return {
    id: existing?.id ?? newIntentId(externalId),
    externalId,
    category,
    question,
    intentDescription,
    aliases: existing?.aliases ?? [],
    keywords: existing?.keywords ?? [],
    excludeKeywords: existing?.excludeKeywords ?? [],
    active: existing?.active ?? true,
    featured: existing?.featured ?? false,
    displayOrder,
  };
}

export function parseWorkbookRows(
  rows: WorkbookRows,
  options: ParseWorkbookOptions = {},
): ImportReport {
  if (rows.length === 0) {
    throw new Error(`Missing required workbook headers: ${REQUIRED_HEADERS.join(', ')}`);
  }

  const headers = rows[0].map(normalizeText);
  const indexes = new Map<string, number>();
  headers.forEach((header, index) => {
    if (header && !indexes.has(header)) {
      indexes.set(header, index);
    }
  });

  const missingHeaders = REQUIRED_HEADERS.filter((header) => !indexes.has(header));
  if (missingHeaders.length > 0) {
    throw new Error(`Missing required workbook headers: ${missingHeaders.join(', ')}`);
  }

  const answerColumns = headers
    .map((header, index) => ({ header, index }))
    .filter(({ header }) => isAnswerHeader(header));
  if (answerColumns.length === 0) {
    throw new Error('Missing workbook answer columns');
  }

  const existingByQuestion = new Map<string, QuestionIntent>();
  for (const intent of options.existingIntents ?? []) {
    const question = normalizeText(intent.question);
    if (question && !existingByQuestion.has(question)) {
      existingByQuestion.set(question, intent);
    }
  }

  const intents: QuestionIntent[] = [];
  const rawAnswers: RawAnswer[] = [];
  const rejectedCells: RejectedWorkbookCell[] = [];
  const skippedCells: SkippedWorkbookCell[] = [];
  const importedAt = options.importedAt ?? new Date().toISOString();

  for (let rowIndex = 1; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex];
    if (headers.every((_header, columnIndex) => isBlank(row[columnIndex]))) {
      continue;
    }

    const rowNumber = rowIndex + 1;
    const intent = createIntent(
      row,
      rowNumber,
      intents.length + 1,
      indexes,
      existingByQuestion,
    );
    intents.push(intent);

    for (const { header, index } of answerColumns) {
      const value = row[index] ?? null;
      const cell = cellAddress(rowNumber, index + 1);
      const answer = normalizeText(value);
      if (!answer) {
        skippedCells.push({
          row: rowNumber,
          column: index + 1,
          cell,
          header,
          value,
          reason: 'blank-answer',
        });
        continue;
      }
      if (intent.externalId?.toUpperCase() === 'Q11') {
        skippedCells.push({
          row: rowNumber,
          column: index + 1,
          cell,
          header,
          value,
          reason: 'reserved-question-q11',
        });
        continue;
      }
      if (/^\d{1,2}$/.test(answer)) {
        rejectedCells.push({
          row: rowNumber,
          column: index + 1,
          cell,
          header,
          value,
          reason: 'residual-demographic-value',
        });
        continue;
      }

      rawAnswers.push({
        id: rawAnswerFingerprint(intent.id, header, answer),
        intentId: intent.id,
        answer,
        sourceLabel: header,
        sourceCell: cell,
        createdAt: importedAt,
      });
    }
  }

  return {
    questionCount: intents.length,
    acceptedAnswerCount: rawAnswers.length,
    rejectedAnswerCount: rejectedCells.length,
    publishedCount: 0,
    intents,
    rawAnswers,
    rejectedCells,
    skippedCells,
  };
}

interface ExcelCell {
  value: unknown;
  text: string;
}

interface ExcelRow {
  getCell(column: number): ExcelCell;
}

interface ExcelWorksheet {
  rowCount: number;
  columnCount: number;
  getRow(row: number): ExcelRow;
}

interface ExcelWorkbook {
  xlsx: {
    readFile(path: string): Promise<unknown>;
  };
  worksheets: ExcelWorksheet[];
}

interface ExcelJsModule {
  default?: {
    Workbook: new () => ExcelWorkbook;
  };
  Workbook?: new () => ExcelWorkbook;
}

export const readXlsxRows: WorkbookRowReader = async (workbookPath) => {
  const excelJs = await import('exceljs') as unknown as ExcelJsModule;
  const Workbook = excelJs.default?.Workbook ?? excelJs.Workbook;
  if (!Workbook) {
    throw new Error('exceljs did not expose a Workbook constructor');
  }

  const workbook = new Workbook();
  await workbook.xlsx.readFile(workbookPath);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error('Workbook has no worksheets');
  }

  const rows: unknown[][] = [];
  for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values: unknown[] = [];
    for (let column = 1; column <= worksheet.columnCount; column += 1) {
      const cell = row.getCell(column);
      const value = cell.value;
      values.push(
        value === null || value === undefined
          ? null
          : typeof value === 'string' || typeof value === 'number'
            ? value
            : cell.text,
      );
    }
    rows.push(values);
  }
  return rows;
};

export async function importWorkbook(
  workbookPath: string,
  repository: ContentRepository,
  options: ImportWorkbookOptions = {},
): Promise<ImportExecutionReport> {
  const repositoryIntents = await repository.getIntentCatalog();
  const rows = await (options.readRows ?? readXlsxRows)(workbookPath);
  const report = parseWorkbookRows(rows, {
    existingIntents: [...repositoryIntents, ...(options.existingIntents ?? [])],
    importedAt: options.importedAt,
  });

  if (options.dryRun) {
    return { ...report, insertedRawAnswerCount: 0 };
  }

  const atomicRepository = repository as ContentRepository & {
    importDatasetAtomically?: (
      intents: readonly QuestionIntent[],
      rawAnswers: readonly RawAnswer[],
    ) => Promise<number>;
  };
  if (typeof atomicRepository.importDatasetAtomically === 'function') {
    const insertedRawAnswerCount = await atomicRepository.importDatasetAtomically(
      report.intents,
      report.rawAnswers,
    );
    return { ...report, insertedRawAnswerCount };
  }
  for (const intent of report.intents) {
    await repository.createIntent(intent);
  }
  const insertedRawAnswerCount = await repository.upsertRawAnswers(report.rawAnswers);
  return { ...report, insertedRawAnswerCount };
}
