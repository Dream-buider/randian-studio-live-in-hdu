import path from 'node:path';

export type PublicTrialConfig = Readonly<{
  host: '127.0.0.1';
  port: number;
  upstreamOrigin: 'http://127.0.0.1:3210';
  publicDir: string;
  runtimeDir: string;
  accessCode: string;
  sessionSecret: string;
  sessionTtlSeconds: 43_200;
  questionLimit: 30;
  questionWindowMs: 600_000;
  maxQuestionCodePoints: 500;
}>;

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim() ?? '';
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function configuredPort(value: string | undefined): number {
  if (value === undefined || value.trim() === '') {
    return 3211;
  }
  const port = Number(value);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PUBLIC_TRIAL_PORT must be an integer from 1 to 65535');
  }
  return port;
}

export function loadPublicTrialConfig(
  env: NodeJS.ProcessEnv,
  appRoot: string,
): PublicTrialConfig {
  const accessCode = required(env, 'PUBLIC_TRIAL_ACCESS_CODE');
  if ([...accessCode].length < 8) {
    throw new Error('PUBLIC_TRIAL_ACCESS_CODE must be at least 8 characters');
  }
  const sessionSecret = required(env, 'PUBLIC_TRIAL_SESSION_SECRET');
  if ([...sessionSecret].length < 32) {
    throw new Error('PUBLIC_TRIAL_SESSION_SECRET must be at least 32 characters');
  }

  const host = env.PUBLIC_TRIAL_HOST?.trim() || '127.0.0.1';
  if (host !== '127.0.0.1') {
    throw new Error('PUBLIC_TRIAL_HOST must remain on the 127.0.0.1 loopback address');
  }
  const upstreamOrigin = env.PUBLIC_TRIAL_UPSTREAM?.trim()
    || 'http://127.0.0.1:3210';
  if (upstreamOrigin !== 'http://127.0.0.1:3210') {
    throw new Error('PUBLIC_TRIAL_UPSTREAM must remain on the fixed loopback origin');
  }

  const runtimeDir = path.resolve(
    env.PUBLIC_TRIAL_RUNTIME_DIR?.trim()
      || 'D:\\Star\\LIVE_IN_HDU_RUNTIME\\public-trial',
  );
  if (path.parse(runtimeDir).root.toUpperCase() !== 'D:\\') {
    throw new Error('PUBLIC_TRIAL_RUNTIME_DIR must be located on D:');
  }

  return {
    host,
    port: configuredPort(env.PUBLIC_TRIAL_PORT),
    upstreamOrigin,
    publicDir: path.resolve(appRoot, 'dist', 'public-trial-client'),
    runtimeDir,
    accessCode,
    sessionSecret,
    sessionTtlSeconds: 43_200,
    questionLimit: 30,
    questionWindowMs: 600_000,
    maxQuestionCodePoints: 500,
  };
}
