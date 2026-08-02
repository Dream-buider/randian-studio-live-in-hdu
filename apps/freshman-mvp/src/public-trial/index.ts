import { appendFile, mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createPublicTrialApp } from './app.js';
import { loadPublicTrialConfig } from './config.js';

function defaultAppRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
}

function unquote(value: string): string {
  if (
    value.length >= 2
    && ((value.startsWith('"') && value.endsWith('"'))
      || (value.startsWith("'") && value.endsWith("'")))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

export function parseLocalEnvironment(contents: string): NodeJS.ProcessEnv {
  const parsed: NodeJS.ProcessEnv = {};
  for (const rawLine of contents.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u.exec(line);
    if (!match) {
      throw new Error('Invalid line in .env.local');
    }
    parsed[match[1]] = unquote(match[2].trim());
  }
  return parsed;
}

async function loadRuntimeEnvironment(appRoot: string): Promise<NodeJS.ProcessEnv> {
  let fromFile: NodeJS.ProcessEnv = {};
  try {
    fromFile = parseLocalEnvironment(
      await readFile(path.join(appRoot, '.env.local'), 'utf8'),
    );
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
      throw error;
    }
  }
  return { ...fromFile, ...process.env };
}

export async function runPublicTrialGateway(): Promise<void> {
  const appRoot = defaultAppRoot();
  const config = loadPublicTrialConfig(await loadRuntimeEnvironment(appRoot), appRoot);
  const logsDir = path.join(config.runtimeDir, 'logs');
  await mkdir(logsDir, { recursive: true });
  const logPath = path.join(logsDir, 'gateway.jsonl');
  let logWrites = Promise.resolve();
  const app = createPublicTrialApp({
    config,
    writeLog: (entry) => {
      logWrites = logWrites.then(() => appendFile(
        logPath,
        `${JSON.stringify(entry)}\n`,
        'utf8',
      ));
      return logWrites;
    },
  });
  let shuttingDown = false;
  const shutdown = async () => {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    await app.close();
    await logWrites;
  };
  process.once('SIGINT', () => void shutdown().then(() => process.exit(0)));
  process.once('SIGTERM', () => void shutdown().then(() => process.exit(0)));
  try {
    await app.listen({ host: config.host, port: config.port });
  } catch (error) {
    await app.close();
    throw error;
  }
  process.stdout.write(
    `LIVE IN HDU 公网内测网关：http://127.0.0.1:${config.port}\n`,
  );
}

function isEntrypoint(): boolean {
  const entry = process.argv[1];
  return Boolean(entry)
    && pathToFileURL(path.resolve(entry)).href === import.meta.url;
}

if (isEntrypoint()) {
  runPublicTrialGateway().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`LIVE IN HDU public trial failed to start: ${message}\n`);
    process.exitCode = 1;
  });
}
