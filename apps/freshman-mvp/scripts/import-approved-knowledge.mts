import path from 'node:path';
import {
  KnowledgeImportService,
  WeKnoraKnowledgeClient,
  validateApprovedKnowledgeManifest,
} from '../src/services/knowledge-import-service.js';

interface CliOptions {
  manifestPath: string;
  approvedRoot: string | null;
  dryRun: boolean;
  wait: boolean;
  timeoutMinutes: number;
}

function parseArgs(argv: string[]): CliOptions {
  let manifestPath = '';
  let approvedRoot: string | null = null;
  let dryRun = false;
  let wait = false;
  let timeoutMinutes = 30;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      dryRun = true;
      continue;
    }
    if (arg === '--wait') {
      wait = true;
      continue;
    }
    if (arg === '--manifest' || arg === '--approved-root' || arg === '--timeout-minutes') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${arg} requires a value`);
      }
      index += 1;
      if (arg === '--manifest') {
        manifestPath = value;
      } else if (arg === '--approved-root') {
        approvedRoot = value;
      } else {
        timeoutMinutes = Number(value);
        if (!Number.isFinite(timeoutMinutes) || timeoutMinutes <= 0) {
          throw new Error('--timeout-minutes must be a positive number');
        }
      }
      continue;
    }
    throw new Error(`unknown argument: ${arg}`);
  }
  if (manifestPath.trim().length === 0) {
    throw new Error('--manifest is required; imports never scan the workspace automatically');
  }
  return {
    manifestPath: path.resolve(manifestPath),
    approvedRoot: approvedRoot ? path.resolve(approvedRoot) : null,
    dryRun,
    wait,
    timeoutMinutes,
  };
}

function requiredEnvironment(names: readonly string[]): Record<string, string> {
  const missing = names.filter((name) => !(process.env[name] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(`live import blocked: missing configuration ${missing.join(', ')}`);
  }
  return Object.fromEntries(
    names.map((name) => [name, (process.env[name] ?? '').trim()]),
  );
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const approvedRoot = options.approvedRoot
    ?? path.join(path.dirname(options.manifestPath), 'approved-knowledge');
  const manifest = await validateApprovedKnowledgeManifest(
    options.manifestPath,
    approvedRoot,
  );
  if (options.dryRun) {
    process.stdout.write(`${JSON.stringify({
      mode: 'dry-run',
      valid: true,
      manifestVersion: manifest.version,
      itemCount: manifest.items.length,
      items: manifest.items.map((item) => ({
        path: item.itemPath,
        title: item.title,
        sha256: item.contentSha256,
        approvedBy: item.approvedBy,
        approvedAt: item.approvedAt,
        ingestMode: item.ingestMode,
      })),
    }, null, 2)}\n`);
    return;
  }

  const environment = requiredEnvironment([
    'POSTGRES_URL',
    'WEKNORA_API_KEY',
    'WEKNORA_DOCUMENT_KB_ID',
  ]);
  const [{ createPostgresPool }, { migratePostgres }, { PostgresKnowledgeImportStore }] = await Promise.all([
    import('../src/db/postgres.js'),
    import('../src/db/postgres-migrations.js'),
    import('../src/repositories/postgres-knowledge-import-store.js'),
  ]);
  const pool = await createPostgresPool(environment.POSTGRES_URL);
  try {
    await migratePostgres(pool);
    const store = new PostgresKnowledgeImportStore(pool);
    const client = new WeKnoraKnowledgeClient({
      baseUrl: (process.env.WEKNORA_BASE_URL ?? 'http://127.0.0.1:8080/api/v1').trim(),
      apiKey: environment.WEKNORA_API_KEY,
    });
    const service = new KnowledgeImportService(store, client, {
      knowledgeBaseId: environment.WEKNORA_DOCUMENT_KB_ID,
    });
    const result = await service.importManifest(options.manifestPath, {
      approvedRoot,
      wait: options.wait,
      timeoutMs: options.timeoutMinutes * 60_000,
    });
    process.stdout.write(`${JSON.stringify({
      mode: 'import',
      created: result.created,
      skipped: result.skipped,
      completed: result.completed,
      failed: result.failed,
      items: result.items.map((item) => ({
        path: item.itemPath,
        version: item.version,
        sha256: item.contentSha256,
        weknoraKnowledgeId: item.weknoraKnowledgeId,
        parseStatus: item.parseStatus,
        lastError: item.lastError,
      })),
    }, null, 2)}\n`);
    if (result.failed > 0) {
      process.exitCode = 1;
    }
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`Approved knowledge import failed: ${
    error instanceof Error ? error.message : String(error)
  }\n`);
  process.exitCode = 1;
});
