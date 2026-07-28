import { mkdir, readFile, realpath, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { migrateDatabase } from '../db/migrations.js';
import { openDatabase, type SqliteDatabase } from '../db/sqlite.js';
import type { SourceRef } from '../domain/models.js';
import type {
  IntentClassification,
  ModelAnswer,
  ModelProvider,
  SynthesisInput,
} from '../providers/contracts.js';
import {
  LocalKnowledgeProvider,
  type LocalKnowledgeRecord,
} from '../providers/local-knowledge-provider.js';
import { TokenDanceProvider } from '../providers/tokendance-provider.js';
import { SearxngProvider } from '../providers/searxng-provider.js';
import { UnavailableSearchProvider } from '../providers/unavailable-search-provider.js';
import { SqliteContentRepository } from '../repositories/sqlite-content-repository.js';
import { SqliteReviewRepository } from '../repositories/sqlite-review-repository.js';
import type {
  ContentRepository,
  ReviewRepository,
} from '../repositories/contracts.js';
import { AnswerRouter } from '../services/answer-router.js';
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
}

export interface ProductionRuntime {
  app: FastifyInstance;
  config: AppConfig;
  content: ContentRepository;
  reviews: ReviewRepository;
  database: SqliteDatabase;
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

async function ensureDDriveRuntimePath(databasePath: string): Promise<void> {
  const parent = path.dirname(databasePath);
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
  await ensureDDriveRuntimePath(config.databasePath);

  const database = openDatabase(config.databasePath);
  let closed = false;
  try {
    migrateDatabase(database);
    const content = new SqliteContentRepository(database);
    const reviews = new SqliteReviewRepository(database);
    const model: ModelProvider = config.modelEnabled
      ? new TokenDanceProvider({
          apiKey: config.modelApiKey,
          fetch: options.fetch,
          timeoutMs: config.requestTimeoutMs,
        })
      : new DisabledModelProvider();
    const knowledge = new LocalKnowledgeProvider(await loadLocalKnowledge(appRoot));
    const search = config.searchProvider === 'searxng'
      ? new SearxngProvider({
          baseUrl: config.searxngBaseUrl,
          fetch: options.fetch,
          timeoutMs: config.searchTimeoutMs,
          maxResults: config.searchMaxResults,
        })
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
      router,
      publicDir: config.publicDir,
      health: async () => ({
        status: 'ok',
        components: {
          database: { status: 'ok', mode: 'sqlite' },
          model: config.modelEnabled
            ? { status: 'configured', mode: 'tokendance' }
            : { status: 'disabled', mode: 'no-key' },
          knowledge: { status: 'ok', mode: 'local-json' },
          search: config.searchProvider === 'searxng'
            ? { status: 'configured', mode: 'searxng' }
            : { status: 'unavailable', mode: 'phase-a-disabled' },
          reviewQueue: {
            status: 'ok',
            pending: (await reviews.list('pending')).length,
          },
        },
      }),
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
        await app.close();
        database.close();
      },
    };
  } catch (error) {
    database.close();
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
