import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { migrateDatabase } from '../db/migrations.js';
import { openDatabase, type SqliteDatabase } from '../db/sqlite.js';
import type { SourceRef } from '../domain/models.js';
import { resolveFreshmanGuideSource } from '../content/freshman-guide.js';
import type {
  IntentClassification,
  KnowledgeProvider,
  ModelAnswer,
  ModelProvider,
  SynthesisInput,
} from '../providers/contracts.js';
import {
  LocalKnowledgeProvider,
  type LocalKnowledgeRecord,
} from '../providers/local-knowledge-provider.js';
import { HduFirstSearchProvider } from '../providers/hdu-search-provider.js';
import { TokenDanceProvider } from '../providers/tokendance-provider.js';
import { SearxngProvider } from '../providers/searxng-provider.js';
import { WeKnoraProvider } from '../providers/weknora-provider.js';
import { UnavailableSearchProvider } from '../providers/unavailable-search-provider.js';
import { SqliteContentRepository } from '../repositories/sqlite-content-repository.js';
import { SqliteApprovedReviewPublisher } from '../repositories/sqlite-approved-review-publisher.js';
import { SqliteReviewRepository } from '../repositories/sqlite-review-repository.js';
import type {
  ApprovedReviewPublisher,
  ContentRepository,
  ReviewRepository,
} from '../repositories/contracts.js';
import { AnswerRouter } from '../services/answer-router.js';
import { FaqSyncService, WeKnoraFaqClient } from '../services/faq-sync-service.js';
import { IntentMatcher } from '../services/intent-matcher.js';
import { createApp } from './app.js';
import { loadConfig, type AppConfig } from './config.js';

interface LegacyKnowledgeItem {
  question: string;
  aliases?: string[];
  keywords?: string[];
  excludeKeywords?: string[];
  answer: string;
  source?: { title?: string; url?: string };
}

export interface ProductionRuntimeOptions {
  appRoot?: string;
  env?: NodeJS.ProcessEnv;
  fetch?: typeof globalThis.fetch;
  runtimePlatform?: NodeJS.Platform;
}

export interface ProductionRuntime {
  app: FastifyInstance;
  config: AppConfig;
  content: ContentRepository;
  reviews: ReviewRepository;
  database: SqliteDatabase | null;
  listen(overrides?: { host?: string; port?: number }): Promise<string>;
  close(): Promise<void>;
}

class DisabledModelProvider implements ModelProvider {
  async classifyIntent(): Promise<IntentClassification | null> {
    return null;
  }

  async synthesize(_input: SynthesisInput): Promise<ModelAnswer> {
    throw new Error('TokenDance is disabled because no API key is configured');
  }
}

function defaultAppRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

async function ensureDDriveRuntimePath(
  databasePath: string,
  runtimePlatform: NodeJS.Platform = process.platform,
): Promise<void> {
  const parent = path.dirname(databasePath);
  if (runtimePlatform !== 'win32') {
    await mkdir(parent, { recursive: true });
    return;
  }
  const lexicalRoot = path.parse(parent).root.toUpperCase();
  if (lexicalRoot === 'D:\\') {
    await mkdir(parent, { recursive: true });
  } else {
    let existing = parent;
    while (true) {
      try {
        await stat(existing);
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error;
        }
        const next = path.dirname(existing);
        if (next === existing) {
          throw new Error('Runtime database parent does not exist');
        }
        existing = next;
      }
    }
    const resolvedExisting = await realpath(existing);
    if (path.parse(resolvedExisting).root.toUpperCase() !== 'D:\\') {
      throw new Error('Runtime database must resolve to the D: data drive');
    }
    await mkdir(parent, { recursive: true });
  }
  const resolvedParent = await realpath(parent);
  if (path.parse(resolvedParent).root.toUpperCase() !== 'D:\\') {
    throw new Error('Runtime database must resolve to the D: data drive');
  }
}

async function loadLocalKnowledge(appRoot: string): Promise<LocalKnowledgeRecord[]> {
  const raw = await readFile(path.join(appRoot, 'data', 'knowledge.json'), 'utf8');
  const parsed = JSON.parse(raw) as { items?: LegacyKnowledgeItem[] };
  if (!Array.isArray(parsed.items)) {
    throw new Error('Local knowledge file must contain an items array');
  }
  return parsed.items
    .filter((item) => (
      typeof item.question === 'string'
      && typeof item.answer === 'string'
      && item.question.trim().length > 0
      && item.answer.trim().length > 0
    ))
    .map((item) => {
      const sources: SourceRef[] = item.source?.title?.trim()
        ? [{
            type: 'community',
            title: item.source.title.trim(),
            url: item.source.url?.trim() ?? '',
            updatedAt: null,
          }]
        : [];
      return {
        question: item.question.trim(),
        aliases: item.aliases?.filter((value) => typeof value === 'string') ?? [],
        keywords: item.keywords?.filter((value) => typeof value === 'string') ?? [],
        excludeKeywords: item.excludeKeywords?.filter((value) => typeof value === 'string') ?? [],
        answer: item.answer.trim(),
        sources,
      };
    });
}

export async function createProductionRuntime(
  options: ProductionRuntimeOptions = {},
): Promise<ProductionRuntime> {
  const appRoot = path.resolve(options.appRoot ?? defaultAppRoot());
  const config = loadConfig(options.env ?? process.env, appRoot);
  let database: SqliteDatabase | null = null;
  let content: ContentRepository;
  let reviews: ReviewRepository;
  let approvedReviewPublisher: ApprovedReviewPublisher | undefined;
  let closeStorage: () => Promise<void> = async () => { database?.close(); };
  let postgresPool: import('../db/postgres.js').PostgresPool | null = null;
  let faqSync: FaqSyncService | null = null;
  let faqStore: import(
    '../repositories/postgres-faq-sync-store.js'
  ).PostgresFaqSyncStore | null = null;
  let faqTimer: NodeJS.Timeout | null = null;
  let knowledgeImports: import(
    '../repositories/postgres-knowledge-import-store.js'
  ).PostgresKnowledgeImportStore | null = null;
  let knowledgeImportRetry: {
    retry(id: string): Promise<unknown>;
  } | null = null;
  let closed = false;
  try {
    if (config.databaseProvider === 'sqlite') {
      await ensureDDriveRuntimePath(
        config.databasePath,
        options.runtimePlatform,
      );
      database = openDatabase(config.databasePath);
      migrateDatabase(database);
      content = new SqliteContentRepository(database);
      reviews = new SqliteReviewRepository(database);
      approvedReviewPublisher = new SqliteApprovedReviewPublisher(database);
      closeStorage = async () => { database?.close(); };
    } else {
      if (!config.postgresUrl) {
        throw new Error('POSTGRES_URL is required when DATABASE_PROVIDER=postgres');
      }
      const [{ createPostgresPool }, { migratePostgres }, { PostgresContentRepository }, { PostgresReviewRepository }] = await Promise.all([
        import('../db/postgres.js'),
        import('../db/postgres-migrations.js'),
        import('../repositories/postgres-content-repository.js'),
        import('../repositories/postgres-review-repository.js'),
      ]);
      const pool = await createPostgresPool(config.postgresUrl);
      postgresPool = pool;
      try {
        await migratePostgres(pool);
      } catch (error) {
        await pool.end();
        throw error;
      }
      content = new PostgresContentRepository(pool);
      reviews = new PostgresReviewRepository(pool);
      const { PostgresKnowledgeImportStore } = await import(
        '../repositories/postgres-knowledge-import-store.js'
      );
      knowledgeImports = new PostgresKnowledgeImportStore(pool);
      closeStorage = async () => { await pool.end(); };
    }
    const tokenDance = config.modelEnabled
      ? new TokenDanceProvider({
          apiKey: config.modelApiKey,
          fetch: options.fetch,
          timeoutMs: config.requestTimeoutMs,
        })
      : null;
    const model: ModelProvider = tokenDance ?? new DisabledModelProvider();
    const weknora = config.knowledgeProvider === 'weknora'
      ? new WeKnoraProvider({
          baseUrl: config.weknoraBaseUrl,
          apiKey: config.weknoraApiKey,
          knowledgeBaseIds: [
            config.weknoraDocumentKbId,
            config.weknoraFaqKbId,
          ],
          scoreThreshold: config.weknoraScoreThreshold,
          timeoutMs: 10_000,
          maxHits: 8,
          fetch: options.fetch,
          sourceResolver: ({ title, content }) => resolveFreshmanGuideSource(title, content),
        })
      : null;
    const knowledge: KnowledgeProvider = weknora
      ?? new LocalKnowledgeProvider(await loadLocalKnowledge(appRoot));
    if (
      knowledgeImports
      && config.weknoraApiKey.length > 0
      && config.weknoraDocumentKbId.length > 0
    ) {
      const { KnowledgeImportService, WeKnoraKnowledgeClient } = await import(
        '../services/knowledge-import-service.js'
      );
      const importService = new KnowledgeImportService(
        knowledgeImports,
        new WeKnoraKnowledgeClient({
          baseUrl: config.weknoraBaseUrl,
          apiKey: config.weknoraApiKey,
          fetch: options.fetch,
        }),
        { knowledgeBaseId: config.weknoraDocumentKbId },
      );
      const approvedRoot = path.resolve(
        appRoot,
        '..',
        '..',
        'output',
        'freshman-platform',
        'approved-knowledge',
      );
      knowledgeImportRetry = {
        retry: (id: string) => importService.retry(id, { approvedRoot }),
      };
    }
    if (
      postgresPool
      && config.weknoraApiKey.length > 0
      && config.weknoraFaqKbId.length > 0
    ) {
      const { PostgresFaqSyncStore } = await import(
        '../repositories/postgres-faq-sync-store.js'
      );
      faqStore = new PostgresFaqSyncStore(postgresPool);
      faqSync = new FaqSyncService(
        faqStore,
        new WeKnoraFaqClient({
          baseUrl: config.weknoraBaseUrl,
          apiKey: config.weknoraApiKey,
          knowledgeBaseId: config.weknoraFaqKbId,
          fetch: options.fetch,
        }),
      );
      const processFaqOutbox = async () => {
        try {
          await faqSync?.processBatch(10);
        } catch {
          // Persistent row state and component health retain the failure boundary.
        }
      };
      faqTimer = setInterval(() => void processFaqOutbox(), 15_000);
      faqTimer.unref();
      void processFaqOutbox();
    }
    const publicSearch = config.searchProvider === 'searxng'
      ? new SearxngProvider({
          baseUrl: config.searxngBaseUrl,
          fetch: options.fetch,
          timeoutMs: config.searchTimeoutMs,
          maxResults: config.searchMaxResults,
        })
      : null;
    const search = publicSearch
      ? new HduFirstSearchProvider(publicSearch, config.searchMaxResults)
      : new UnavailableSearchProvider();
    const router = new AnswerRouter({
      content,
      reviews,
      intentMatcher: new IntentMatcher(model),
      knowledge,
      search,
      model,
      disclaimer: config.disclaimer,
    });
    const app = createApp({
      config,
      content,
      reviews,
      approvedReviewPublisher,
      router,
      publicDir: config.publicDir,
      faqSync: faqSync ?? undefined,
      knowledgeImports: knowledgeImports ?? undefined,
      knowledgeImportRetry: knowledgeImportRetry ?? undefined,
      health: async () => {
        const outboxCounts = faqStore
          ? await faqStore.counts()
          : { pending: 0, failed: 0 };
        const weknoraStatus = weknora?.status() ?? 'not-configured';
        return {
          status: 'ok',
          components: {
            gateway: { status: 'healthy' },
            businessDatabase: {
              status: 'healthy',
              mode: config.databaseProvider,
            },
            database: { status: 'ok', mode: config.databaseProvider },
            model: config.modelEnabled
              ? { status: 'configured', mode: 'tokendance' }
              : { status: 'disabled', mode: 'no-key' },
            tokenDance: tokenDance?.status() ?? {
              status: 'disabled',
              lastCallStatus: 'never',
              lastCallAt: null,
            },
            knowledge: weknora
              ? { status: weknoraStatus, mode: 'weknora' }
              : { status: 'ok', mode: 'local-json' },
            weknora: { status: weknoraStatus },
            embedding: {
              status: weknora ? 'configured' : 'not-configured',
              mode: 'ollama',
            },
            search: publicSearch
              ? { ...publicSearch.status(), mode: 'searxng' }
              : {
                  status: 'unavailable',
                  mode: 'phase-a-disabled',
                  lastSearchStatus: 'never',
                  lastSearchAt: null,
                },
            reviewQueue: {
              status: 'ok',
              pending: (await reviews.list('pending')).length,
            },
            integrationOutbox: {
              status: faqStore ? 'ok' : 'not-configured',
              ...outboxCounts,
            },
          },
        };
      },
    });

    return {
      app,
      config,
      content,
      reviews,
      database,
      async listen(overrides = {}) {
        return app.listen({
          host: overrides.host ?? config.host,
          port: overrides.port ?? config.port,
        });
      },
      async close() {
        if (closed) {
          return;
        }
        closed = true;
        if (faqTimer) {
          clearInterval(faqTimer);
          faqTimer = null;
        }
        await app.close();
        await closeStorage();
      },
    };
  } catch (error) {
    if (faqTimer) {
      clearInterval(faqTimer);
      faqTimer = null;
    }
    await closeStorage?.();
    throw error;
  }
}

function lanAddresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        addresses.push(entry.address);
      }
    }
  }
  return addresses;
}

export async function runProductionServer(): Promise<void> {
  const runtime = await createProductionRuntime();
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await runtime.close();
  };
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));

  try {
    await runtime.listen();
  } catch (error) {
    await runtime.close();
    throw error;
  }

  process.stdout.write(`LIVE IN HDU 本地服务：http://localhost:${runtime.config.port}\n`);
  process.stdout.write(`LIVE IN HDU 本机管理：http://localhost:${runtime.config.port}/admin\n`);
  for (const address of lanAddresses()) {
    process.stdout.write(`LIVE IN HDU 局域网用户端：http://${address}:${runtime.config.port}\n`);
  }
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  if (!entry) {
    return false;
  }
  return pathToFileURL(path.resolve(entry)).href === import.meta.url
    || path.basename(entry).toLowerCase() === 'server.mjs';
}

if (isEntrypoint()) {
  runProductionServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`LIVE IN HDU failed to start: ${message}\n`);
    process.exitCode = 1;
  });
}
