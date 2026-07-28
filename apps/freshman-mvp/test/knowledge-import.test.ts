import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import {
  KnowledgeImportService,
  WeKnoraKnowledgeClient,
  validateApprovedKnowledgeManifest,
  type KnowledgeImportRecord,
  type KnowledgeImportStore,
} from '../src/services/knowledge-import-service.js';
import { createApp } from '../src/server/app.js';

const TEST_ROOT = 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\tests\\knowledge-import';

async function withApprovedFiles(
  run: (context: {
    root: string;
    approvedRoot: string;
    manifestPath: string;
  }) => Promise<void>,
): Promise<void> {
  await mkdir(TEST_ROOT, { recursive: true });
  const root = await mkdtemp(path.join(TEST_ROOT, 'case-'));
  const approvedRoot = path.join(root, 'approved-knowledge');
  const manifestPath = path.join(root, 'knowledge-manifest.json');
  await mkdir(approvedRoot, { recursive: true });
  try {
    await run({ root, approvedRoot, manifestPath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

function manifestItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    path: 'guide.md',
    title: '2025年新生指南',
    sourceType: 'community',
    sourceUrl: '',
    publishedAt: '2025-08-01',
    applicableYear: 2025,
    approvedBy: 'local-admin',
    approvedAt: '2026-07-28T12:00:00+08:00',
    ...overrides,
  };
}

async function writeManifest(
  manifestPath: string,
  items: Record<string, unknown>[],
): Promise<void> {
  await writeFile(
    manifestPath,
    `${JSON.stringify({ version: 1, items }, null, 2)}\n`,
    'utf8',
  );
}

class MemoryImportStore implements KnowledgeImportStore {
  records: KnowledgeImportRecord[] = [];
  events: Array<{ importId: string; status: string; detail: string | null }> = [];

  async list(): Promise<KnowledgeImportRecord[]> {
    return structuredClone(this.records);
  }

  async findByHash(
    knowledgeBaseId: string,
    contentSha256: string,
  ): Promise<KnowledgeImportRecord | null> {
    return structuredClone(
      this.records.find((record) => (
        record.knowledgeBaseId === knowledgeBaseId
        && record.contentSha256 === contentSha256
      )) ?? null,
    );
  }

  async findApproval(
    manifestPath: string,
    itemPath: string,
    approvedBy: string,
    approvedAt: string,
  ): Promise<KnowledgeImportRecord | null> {
    return structuredClone(
      this.records.find((record) => (
        record.manifestPath === manifestPath
        && record.itemPath === itemPath
        && record.approvedBy === approvedBy
        && record.approvedAt === approvedAt
      )) ?? null,
    );
  }

  async createVersion(
    input: Omit<
      KnowledgeImportRecord,
      'id' | 'version' | 'weknoraKnowledgeId' | 'parseStatus'
      | 'lastError' | 'createdAt' | 'updatedAt'
    >,
  ): Promise<KnowledgeImportRecord> {
    const version = Math.max(
      0,
      ...this.records
        .filter((record) => (
          record.manifestPath === input.manifestPath
          && record.itemPath === input.itemPath
        ))
        .map((record) => record.version),
    ) + 1;
    const now = new Date().toISOString();
    const record: KnowledgeImportRecord = {
      ...input,
      id: `import-${this.records.length + 1}`,
      version,
      weknoraKnowledgeId: null,
      parseStatus: 'validated',
      lastError: null,
      createdAt: now,
      updatedAt: now,
    };
    this.records.push(record);
    return structuredClone(record);
  }

  async updateState(
    id: string,
    input: {
      weknoraKnowledgeId?: string;
      parseStatus: KnowledgeImportRecord['parseStatus'];
      lastError: string | null;
    },
  ): Promise<void> {
    const record = this.records.find((item) => item.id === id);
    assert.ok(record);
    if (input.weknoraKnowledgeId !== undefined) {
      record.weknoraKnowledgeId = input.weknoraKnowledgeId;
    }
    record.parseStatus = input.parseStatus;
    record.lastError = input.lastError;
    record.updatedAt = new Date().toISOString();
  }

  async appendEvent(
    importId: string,
    status: KnowledgeImportRecord['parseStatus'],
    detail: string | null,
  ): Promise<void> {
    this.events.push({ importId, status, detail });
  }
}

test('approved knowledge manifest rejects unsafe, ambiguous, or unapproved entries', async (t) => {
  await withApprovedFiles(async ({ approvedRoot, manifestPath }) => {
    await writeFile(path.join(approvedRoot, 'guide.md'), '# guide\n', 'utf8');

    const cases: Array<{ name: string; items: Record<string, unknown>[]; pattern: RegExp }> = [
      {
        name: 'path traversal',
        items: [manifestItem({ path: '../guide.md' })],
        pattern: /safe relative path/i,
      },
      {
        name: 'missing file',
        items: [manifestItem({ path: 'missing.md' })],
        pattern: /does not exist/i,
      },
      {
        name: 'unsupported extension',
        items: [manifestItem({ path: 'guide.exe' })],
        pattern: /unsupported extension/i,
      },
      {
        name: 'duplicate normalized path',
        items: [manifestItem(), manifestItem({ path: '.\\guide.md' })],
        pattern: /duplicate path/i,
      },
      {
        name: 'blank approver',
        items: [manifestItem({ approvedBy: '   ' })],
        pattern: /approvedBy/i,
      },
      {
        name: 'impossible publication date',
        items: [manifestItem({ publishedAt: '2025-02-30' })],
        pattern: /publishedAt/i,
      },
      {
        name: 'invalid approval timestamp',
        items: [manifestItem({ approvedAt: 'tomorrow' })],
        pattern: /approvedAt/i,
      },
      {
        name: 'impossible approval timestamp',
        items: [manifestItem({ approvedAt: '2026-02-30T25:00:00+08:00' })],
        pattern: /approvedAt/i,
      },
    ];

    for (const item of cases) {
      await t.test(item.name, async () => {
        if (item.name === 'unsupported extension') {
          await writeFile(path.join(approvedRoot, 'guide.exe'), 'x', 'utf8');
        }
        await writeManifest(manifestPath, item.items);
        await assert.rejects(
          validateApprovedKnowledgeManifest(manifestPath, approvedRoot),
          item.pattern,
        );
      });
    }
  });
});

test('approved knowledge manifest rejects malformed JSON and unsupported versions', async () => {
  await withApprovedFiles(async ({ approvedRoot, manifestPath }) => {
    await writeFile(manifestPath, '{not json', 'utf8');
    await assert.rejects(
      validateApprovedKnowledgeManifest(manifestPath, approvedRoot),
      /valid JSON/i,
    );
    await writeFile(
      manifestPath,
      JSON.stringify({ version: 2, items: [] }),
      'utf8',
    );
    await assert.rejects(
      validateApprovedKnowledgeManifest(manifestPath, approvedRoot),
      /version 1/i,
    );
  });
});

test('approved knowledge import is hash-idempotent and changed content requires new approval', async () => {
  await withApprovedFiles(async ({ approvedRoot, manifestPath }) => {
    const filePath = path.join(approvedRoot, 'guide.md');
    await writeFile(filePath, '# version one\n', 'utf8');
    await writeManifest(manifestPath, [manifestItem()]);

    const store = new MemoryImportStore();
    const uploads: string[] = [];
    const service = new KnowledgeImportService(store, {
      async upload(item) {
        uploads.push(await readFile(item.absolutePath, 'utf8'));
        return { knowledgeId: `knowledge-${uploads.length}`, parseStatus: 'pending' };
      },
      async getParseState() {
        return { parseStatus: 'completed', error: null };
      },
    }, {
      knowledgeBaseId: 'kb-documents',
      sleep: async () => {},
    });

    const first = await service.importManifest(manifestPath, {
      approvedRoot,
      wait: true,
      timeoutMs: 100,
    });
    assert.equal(first.created, 1);
    assert.equal(first.completed, 1);
    assert.equal(uploads.length, 1);
    assert.equal(store.records[0].version, 1);

    const duplicate = await service.importManifest(manifestPath, { approvedRoot });
    assert.deepEqual(
      { created: duplicate.created, skipped: duplicate.skipped },
      { created: 0, skipped: 1 },
    );
    assert.equal(uploads.length, 1);

    await writeFile(filePath, '# changed without approval\n', 'utf8');
    await assert.rejects(
      service.importManifest(manifestPath, { approvedRoot }),
      /content changed.*new approval/i,
    );
    assert.equal(store.records.length, 1);

    await writeManifest(manifestPath, [
      manifestItem({ approvedAt: '2026-07-28T13:00:00+08:00' }),
    ]);
    const revised = await service.importManifest(manifestPath, { approvedRoot });
    assert.equal(revised.created, 1);
    assert.equal(store.records[1].version, 2);
    assert.equal(uploads.length, 2);
  });
});

test('WeKnora approved import uses only public file, manual, and list endpoints', async () => {
  await withApprovedFiles(async ({ approvedRoot }) => {
    const filePath = path.join(approvedRoot, 'guide.txt');
    const manualPath = path.join(approvedRoot, 'manual.md');
    await writeFile(filePath, 'file body', 'utf8');
    await writeFile(manualPath, '# manual body', 'utf8');
    const requests: Array<{ url: string; method: string; init?: RequestInit }> = [];
    const responses = [
      Response.json({
        success: true,
        data: { id: 'knowledge-file', parse_status: 'pending' },
      }),
      Response.json({
        success: true,
        data: { id: 'knowledge-manual', parse_status: 'pending' },
      }),
      Response.json({
        success: true,
        data: [{
          id: 'knowledge-file',
          parse_status: 'completed',
          error_message: '',
        }],
        total: 1,
        page: 1,
        page_size: 100,
      }),
    ];
    const client = new WeKnoraKnowledgeClient({
      baseUrl: 'http://127.0.0.1:8080/api/v1',
      apiKey: 'test-secret',
      fetch: async (input, init) => {
        requests.push({ url: String(input), method: init?.method ?? 'GET', init });
        return responses.shift()!;
      },
    });

    await client.upload({
      absolutePath: filePath,
      itemPath: 'guide.txt',
      title: '新生指南',
      sourceType: 'community',
      sourceUrl: '',
      publishedAt: '2025-08-01',
      applicableYear: 2025,
      approvedBy: 'reviewer',
      approvedAt: '2026-07-28T12:00:00+08:00',
      ingestMode: 'file',
      contentSha256: 'a'.repeat(64),
    }, 'kb-documents');
    await client.upload({
      absolutePath: manualPath,
      itemPath: 'manual.md',
      title: '手工 Markdown',
      sourceType: 'community',
      sourceUrl: '',
      publishedAt: '2025-08-01',
      applicableYear: 2025,
      approvedBy: 'reviewer',
      approvedAt: '2026-07-28T12:00:00+08:00',
      ingestMode: 'manual',
      contentSha256: 'b'.repeat(64),
    }, 'kb-documents');
    const state = await client.getParseState('kb-documents', 'knowledge-file');

    assert.match(requests[0].url, /\/knowledge-bases\/kb-documents\/knowledge\/file$/);
    assert.equal(requests[0].method, 'POST');
    const form = requests[0].init?.body as FormData;
    assert.equal(form.get('channel'), 'live-in-hdu-approved');
    assert.equal((form.get('file') as File).name, 'guide.txt');
    assert.equal(
      JSON.parse(String(form.get('metadata'))).content_sha256,
      'a'.repeat(64),
    );
    assert.equal(
      new Headers(requests[0].init?.headers).get('X-API-Key'),
      'test-secret',
    );

    assert.match(requests[1].url, /\/knowledge-bases\/kb-documents\/knowledge\/manual$/);
    assert.equal(requests[1].method, 'POST');
    assert.deepEqual(JSON.parse(String(requests[1].init?.body)), {
      title: '手工 Markdown',
      content: '# manual body',
      channel: 'live-in-hdu-approved',
    });

    assert.match(
      requests[2].url,
      /\/knowledge-bases\/kb-documents\/knowledge\?page=1&page_size=100$/,
    );
    assert.equal(requests[2].method, 'GET');
    assert.deepEqual(state, { parseStatus: 'completed', error: null });
    assert.equal(requests.every(({ url }) => !url.includes('test-secret')), true);
  });
});

test('admin knowledge import status is visible locally without contacting WeKnora', async () => {
  const store = new MemoryImportStore();
  store.records.push({
    id: 'import-1',
    manifestPath: 'D:\\approved\\knowledge-manifest.json',
    itemPath: 'guide.md',
    version: 1,
    contentSha256: 'a'.repeat(64),
    title: '2025年新生指南',
    sourceType: 'community',
    sourceUrl: '',
    publishedAt: '2025-08-01',
    applicableYear: 2025,
    approvedBy: 'reviewer',
    approvedAt: '2026-07-28T04:00:00.000Z',
    ingestMode: 'file',
    knowledgeBaseId: 'kb-documents',
    weknoraKnowledgeId: 'knowledge-1',
    parseStatus: 'completed',
    lastError: null,
    createdAt: '2026-07-28T04:01:00.000Z',
    updatedAt: '2026-07-28T04:02:00.000Z',
  });
  const app = createApp({
    config: {} as never,
    content: {} as never,
    reviews: {} as never,
    router: { async answer() { return {}; } },
    knowledgeImports: store,
  });
  try {
    const response = await app.inject({
      method: 'GET',
      url: '/api/admin/knowledge-imports',
    });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), {
      configured: true,
      items: store.records,
    });
  } finally {
    await app.close();
  }
});
