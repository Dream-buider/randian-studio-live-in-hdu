import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { migrateDatabase } from '../src/db/migrations.js';
import { openDatabase } from '../src/db/sqlite.js';
import type { QuestionIntent, SourceRef } from '../src/domain/models.js';
import { SqliteContentRepository } from '../src/repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../src/repositories/sqlite-review-repository.js';
import {
  backupDatabase,
  inspectDatabase,
  restoreDatabase,
} from '../scripts/backup-sqlite.mjs';

const TEST_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\temp';

const INTENT: QuestionIntent = {
  id: 'backup-intent',
  externalId: 'Q99',
  category: '测试',
  question: '备份是否保留数据？',
  intentDescription: '备份恢复验收',
  aliases: [],
  keywords: ['备份'],
  excludeKeywords: [],
  active: true,
  featured: true,
  displayOrder: 1,
};

const SOURCES: SourceRef[] = [{
  type: 'community',
  title: '测试来源',
  url: '',
  updatedAt: '2026-07-28',
}];

test('online backup and offline restore preserve content, FIFO reviews, and settings', async () => {
  await mkdir(TEST_ROOT, { recursive: true });
  const directory = await mkdtemp(path.join(TEST_ROOT, 'backup-roundtrip-'));
  const databasePath = path.join(directory, 'runtime', 'live-in-hdu.db');
  const backupDirectory = path.join(directory, 'backups');
  const pidFile = path.join(directory, 'platform.pid.json');
  await mkdir(path.dirname(databasePath), { recursive: true });

  const database = openDatabase(databasePath);
  migrateDatabase(database);
  const content = new SqliteContentRepository(database);
  const reviews = new SqliteReviewRepository(database);
  await content.createIntent(INTENT);
  await content.publishCanonicalAnswer({
    intentId: INTENT.id,
    summary: '备份会保留经过审核的正式回答。',
    fullAnswer: '备份会保留问题、正式回答、审核队列与系统设置。',
    sources: SOURCES,
    reviewerId: 'backup-test',
  });
  await reviews.enqueue({
    question: '第一个待审核问题',
    answer: '测试回答一',
    sources: [],
    riskLevel: 'low',
  });
  await reviews.enqueue({
    question: '第二个待审核问题',
    answer: '测试回答二',
    sources: [],
    riskLevel: 'medium',
  });
  database.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
  ).run('theme', 'hdu-blue', new Date().toISOString());

  try {
    const backedUp = await backupDatabase({
      databasePath,
      outputDirectory: backupDirectory,
      retain: 14,
      now: new Date('2026-07-28T01:02:03.456Z'),
    });
    assert.match(path.basename(backedUp.backupPath), /^live-in-hdu-2026-07-28T01-02-03-456Z\.db$/);
    assert.equal(backedUp.integrity, 'ok');
    assert.deepEqual(backedUp.counts, {
      intents: 1,
      canonicalVersions: 1,
      reviews: 2,
      settings: 1,
    });

    database.prepare('DELETE FROM app_settings').run();
    database.prepare('DELETE FROM review_tasks').run();
    database.prepare('DELETE FROM canonical_answers').run();
    database.prepare('DELETE FROM question_intents').run();
    database.close();

    const restored = await restoreDatabase({
      backupPath: backedUp.backupPath,
      databasePath,
      pidFile,
      safetyBackupDirectory: backupDirectory,
      now: new Date('2026-07-28T02:03:04.567Z'),
    });
    assert.equal(restored.integrity, 'ok');
    assert.ok(restored.safetyBackupPath);
    assert.deepEqual(restored.counts, backedUp.counts);

    const verification = openDatabase(databasePath);
    try {
      const reviewRows = (verification.prepare(
        'SELECT ordinal, question FROM review_tasks ORDER BY ordinal ASC',
      ).all() as Array<{ ordinal: number; question: string }>).map((row) => ({
        ordinal: Number(row.ordinal),
        question: String(row.question),
      }));
      assert.deepEqual(reviewRows, [
        { ordinal: 1, question: '第一个待审核问题' },
        { ordinal: 2, question: '第二个待审核问题' },
      ]);
      assert.equal(
        (verification.prepare('SELECT value FROM app_settings WHERE key = ?').get('theme') as { value: string }).value,
        'hdu-blue',
      );
    } finally {
      verification.close();
    }
  } finally {
    try {
      database.close();
    } catch {
      // The test closes the source before restore; repeated close is harmless here.
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test('restore refuses a database whose owned PID metadata points to a live process', async () => {
  await mkdir(TEST_ROOT, { recursive: true });
  const directory = await mkdtemp(path.join(TEST_ROOT, 'restore-live-'));
  const databasePath = path.join(directory, 'live.db');
  const backupPath = path.join(directory, 'backup.db');
  const pidFile = path.join(directory, 'platform.pid.json');
  const database = openDatabase(databasePath);
  migrateDatabase(database);
  database.close();
  const source = openDatabase(backupPath);
  migrateDatabase(source);
  source.close();
  await writeFile(pidFile, JSON.stringify({
    pid: process.pid,
    appRoot: path.resolve('apps/freshman-mvp'),
    entrypoint: 'dist/server/index.js',
  }));

  try {
    await assert.rejects(
      restoreDatabase({
        backupPath,
        databasePath,
        pidFile,
        safetyBackupDirectory: path.join(directory, 'backups'),
      }),
      /running process/i,
    );
    assert.equal((await inspectDatabase(databasePath)).integrity, 'ok');
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('backup accepts documented workspace junction paths only when they resolve to D', async () => {
  const workspaceRoot = path.resolve(import.meta.dirname, '..', '..', '..');
  const token = `junction-${process.pid}-${Date.now()}`;
  const databaseDirectory = path.join(
    workspaceRoot,
    'apps',
    'freshman-mvp',
    'runtime',
    token,
  );
  const databasePath = path.join(databaseDirectory, 'live-in-hdu.db');
  const backupDirectory = path.join(
    workspaceRoot,
    'output',
    'freshman-platform',
    token,
    'backups',
  );
  await mkdir(databaseDirectory, { recursive: true });
  const database = openDatabase(databasePath);
  migrateDatabase(database);
  database.close();

  try {
    const result = await backupDatabase({
      databasePath,
      outputDirectory: backupDirectory,
    });
    assert.equal(path.parse(await realpath(result.backupPath)).root.toUpperCase(), 'D:\\');
  } finally {
    await rm(databaseDirectory, { recursive: true, force: true });
    await rm(path.join(workspaceRoot, 'output', 'freshman-platform', token), {
      recursive: true,
      force: true,
    });
  }
});

test('restore refuses an open WAL database even when PID metadata is missing', async () => {
  await mkdir(TEST_ROOT, { recursive: true });
  const directory = await mkdtemp(path.join(TEST_ROOT, 'restore-open-wal-'));
  const databasePath = path.join(directory, 'live.db');
  const backupPath = path.join(directory, 'backup.db');
  const pidFile = path.join(directory, 'missing.pid.json');
  const live = openDatabase(databasePath);
  migrateDatabase(live);
  live.prepare(
    'INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, ?)',
  ).run('live-probe', 'do-not-overwrite', new Date().toISOString());
  const source = openDatabase(backupPath);
  migrateDatabase(source);
  source.close();

  try {
    await assert.rejects(
      restoreDatabase({
        backupPath,
        databasePath,
        pidFile,
        safetyBackupDirectory: path.join(directory, 'backups'),
      }),
      /live or unclean WAL sidecar/i,
    );
    assert.equal(
      (live.prepare('SELECT value FROM app_settings WHERE key = ?').get('live-probe') as { value: string }).value,
      'do-not-overwrite',
    );
  } finally {
    live.close();
    await rm(directory, { recursive: true, force: true });
  }
});
