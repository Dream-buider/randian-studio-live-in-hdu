import assert from 'node:assert/strict';
import test from 'node:test';
import type {
  CanonicalAnswerVersion,
  PublishedQuestion,
  QuestionIntent,
  RawAnswer,
} from '../src/domain/models.js';
import type {
  ContentRepository,
  PublishCanonicalAnswerInput,
} from '../src/repositories/contracts.js';
import {
  importWorkbook,
  parseWorkbookRows,
  type WorkbookRowReader,
} from '../src/services/content-importer.js';

const REPRESENTATIVE_ROWS = [
  ['问题编号', '问题分类', '新生问题', '回答要点', '学长学姐回答（一）', '回答（二）', '回答（三）'],
  ['Q01', '报到与开学准备', '我会在哪个校区学习？', '询问学习校区', '看你的专业安排。', '不同校区条件不同。', null],
  ['Q02', '报到与开学准备', '新生报到流程是什么？', '询问报到流程', '以录取通知书为准。', null, 19],
] as const;

class RecordingContentRepository implements ContentRepository {
  readonly intents: QuestionIntent[] = [];
  readonly rawAnswers: RawAnswer[] = [];
  private readonly catalog: QuestionIntent[];

  constructor(catalog: QuestionIntent[] = []) {
    this.catalog = catalog;
  }

  async createIntent(input: QuestionIntent): Promise<void> {
    this.intents.push(input);
  }

  async upsertRawAnswers(items: RawAnswer[]): Promise<number> {
    this.rawAnswers.push(...items);
    return items.length;
  }

  async listPublishedQuestions(): Promise<PublishedQuestion[]> {
    return [];
  }

  async getIntentCatalog(): Promise<QuestionIntent[]> {
    return this.catalog;
  }

  async publishCanonicalAnswer(
    _input: PublishCanonicalAnswerInput,
  ): Promise<CanonicalAnswerVersion> {
    throw new Error('importer must never publish canonical answers');
  }

  async listRawAnswers(_intentId: string): Promise<RawAnswer[]> {
    return [];
  }
}

test('workbook cleanup accepts answer columns and identifies residual demographic cells', () => {
  const report = parseWorkbookRows(REPRESENTATIVE_ROWS, {
    importedAt: '2026-07-28T00:00:00.000Z',
  });

  assert.equal(report.intents.length, 2);
  assert.equal(report.rawAnswers.length, 3);
  assert.equal(report.questionCount, 2);
  assert.equal(report.acceptedAnswerCount, 3);
  assert.equal(report.rejectedAnswerCount, 1);
  assert.equal(report.publishedCount, 0);
  assert.deepEqual(report.rejectedCells, [{
    row: 3,
    column: 7,
    cell: 'G3',
    header: '回答（三）',
    value: 19,
    reason: 'residual-demographic-value',
  }]);
  assert.deepEqual(report.skippedCells.map(({ cell, reason }) => ({ cell, reason })), [
    { cell: 'G2', reason: 'blank-answer' },
    { cell: 'F3', reason: 'blank-answer' },
  ]);
});

test('workbook cleanup rejects a missing required header before reading data rows', () => {
  const rows = [
    ['问题编号', '问题分类', '新生问题', '学长学姐回答（一）'],
    ['Q01', '报到与开学准备', '我会在哪个校区学习？', '看你的专业安排。'],
  ];

  assert.throws(
    () => parseWorkbookRows(rows),
    /Missing required workbook headers: 回答要点/,
  );
});

test('workbook cleanup records blank answer cells and leaves an empty Q11-like intent unpublished', () => {
  const rows = [
    ['问题编号', '问题分类', '新生问题', '回答要点', '回答（一）', '学长学姐回答（二）'],
    ['Q11', '宿舍与校园生活', '校园网怎么开通？', '询问校园网办理', '  ', null],
  ];

  const report = parseWorkbookRows(rows);

  assert.equal(report.intents.length, 1);
  assert.equal(report.intents[0].externalId, 'Q11');
  assert.equal(report.rawAnswers.length, 0);
  assert.equal(report.publishedCount, 0);
  assert.deepEqual(report.skippedCells.map(({ cell, reason }) => ({ cell, reason })), [
    { cell: 'E2', reason: 'blank-answer' },
    { cell: 'F2', reason: 'blank-answer' },
  ]);
});

test('workbook cleanup keeps reserved Q11 empty even when the source sheet was filled accidentally', () => {
  const rows = [
    ['问题编号', '问题分类', '新生问题', '回答要点', '回答（一）', '回答（二）'],
    ['Q11', '宿舍与校园生活', '校园网怎么开通？', '询问校园网办理', '误填答案一', '误填答案二'],
  ];

  const report = parseWorkbookRows(rows);

  assert.equal(report.intents.length, 1);
  assert.equal(report.rawAnswers.length, 0);
  assert.equal(report.publishedCount, 0);
  assert.deepEqual(report.skippedCells.map(({ cell, reason }) => ({ cell, reason })), [
    { cell: 'E2', reason: 'reserved-question-q11' },
    { cell: 'F2', reason: 'reserved-question-q11' },
  ]);
});

test('workbook cleanup rejects every numeric-only one or two digit answer and preserves cell details', () => {
  const rows = [
    ['问题编号', '问题分类', '新生问题', '回答要点', '回答（一）', '回答（二）', '回答（三）', '回答（四）'],
    ['Q08', '宿舍与校园生活', '宿舍怎么样？', '询问宿舍情况', 7, ' 09 ', '19', '2026'],
  ];

  const report = parseWorkbookRows(rows);

  assert.deepEqual(
    report.rejectedCells.map(({ cell, value, reason }) => ({ cell, value, reason })),
    [
      { cell: 'E2', value: 7, reason: 'residual-demographic-value' },
      { cell: 'F2', value: ' 09 ', reason: 'residual-demographic-value' },
      { cell: 'G2', value: '19', reason: 'residual-demographic-value' },
    ],
  );
  assert.equal(report.rawAnswers.length, 1);
  assert.equal(report.rawAnswers[0].answer, '2026');
});

test('workbook cleanup produces stable SHA-256 raw-answer fingerprints', () => {
  const first = parseWorkbookRows(REPRESENTATIVE_ROWS);
  const second = parseWorkbookRows(REPRESENTATIVE_ROWS);

  assert.equal(
    first.rawAnswers[0].id,
    'ee9c4d6f85dd1d3d18c248ae777fe369c9abd125946292516a35d0152c134e68',
  );
  assert.deepEqual(
    second.rawAnswers.map((answer) => answer.id),
    first.rawAnswers.map((answer) => answer.id),
  );
});

test('workbook cleanup reuses an exact preset intent ID and otherwise derives a question-number ID', () => {
  const existing: QuestionIntent = {
    id: 'registration-flow',
    externalId: null,
    category: '旧分类',
    question: '新生报到流程是什么？',
    intentDescription: '旧描述',
    aliases: ['如何报到'],
    keywords: ['报到'],
    excludeKeywords: [],
    active: true,
    featured: true,
    displayOrder: 99,
  };

  const report = parseWorkbookRows(REPRESENTATIVE_ROWS, { existingIntents: [existing] });

  assert.equal(report.intents[0].id, 'q-q01');
  assert.equal(report.intents[1].id, 'registration-flow');
  assert.equal(report.intents[1].externalId, 'Q02');
  assert.deepEqual(report.intents[1].aliases, ['如何报到']);
  assert.equal(report.rawAnswers[2].intentId, 'registration-flow');
});

test('workbook import forwards raw evidence, remains idempotency-ready, and never publishes', async () => {
  const repository = new RecordingContentRepository();
  const reader: WorkbookRowReader = async (workbookPath) => {
    assert.equal(workbookPath, 'fixture.xlsx');
    return REPRESENTATIVE_ROWS.map((row) => [...row]);
  };

  const result = await importWorkbook('fixture.xlsx', repository, {
    readRows: reader,
    importedAt: '2026-07-28T00:00:00.000Z',
  });

  assert.equal(result.questionCount, 2);
  assert.equal(result.acceptedAnswerCount, 3);
  assert.equal(result.insertedRawAnswerCount, 3);
  assert.equal(result.publishedCount, 0);
  assert.deepEqual(repository.intents, result.intents);
  assert.deepEqual(repository.rawAnswers, result.rawAnswers);
});
