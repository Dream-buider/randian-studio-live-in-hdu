import { WeKnoraProvider } from '../src/providers/weknora-provider.js';

const required = [
  'WEKNORA_API_KEY',
  'WEKNORA_DOCUMENT_KB_ID',
  'WEKNORA_FAQ_KB_ID',
] as const;

async function main(): Promise<void> {
  const missing = required.filter((name) => !(process.env[name] ?? '').trim());
  if (missing.length > 0) {
    throw new Error(
      `live check blocked: missing configuration ${missing.join(', ')}`,
    );
  }
  const provider = new WeKnoraProvider({
    baseUrl: (process.env.WEKNORA_BASE_URL ?? 'http://127.0.0.1:8080/api/v1').trim(),
    apiKey: process.env.WEKNORA_API_KEY ?? '',
    knowledgeBaseIds: [
      process.env.WEKNORA_DOCUMENT_KB_ID ?? '',
      process.env.WEKNORA_FAQ_KB_ID ?? '',
    ],
    scoreThreshold: Number(process.env.WEKNORA_SCORE_THRESHOLD ?? '0.55'),
    timeoutMs: 10_000,
    maxHits: 8,
  });
  const result = await provider.search('杭州电子科技大学新生指南');
  if (result.status !== 'available') {
    throw new Error(`live check failed with provider status ${result.status}`);
  }
  if (result.hits.length === 0) {
    throw new Error('live check reached WeKnora but found no qualifying knowledge chunks');
  }
  process.stdout.write(`${JSON.stringify({
    status: result.status,
    hitCount: result.hits.length,
    hits: result.hits.map((hit) => ({
      knowledgeId: hit.knowledgeId,
      chunkId: hit.chunkId,
      title: hit.title,
      score: hit.score,
    })),
  }, null, 2)}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`WeKnora check failed: ${
    error instanceof Error ? error.message : String(error)
  }\n`);
  process.exitCode = 1;
});
