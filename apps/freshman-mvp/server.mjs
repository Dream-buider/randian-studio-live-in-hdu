import { createServer } from 'node:http';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadConfig } from './src/config.mjs';
import { JsonStore } from './src/json-store.mjs';
import { ReviewRepository } from './src/review-repository.mjs';
import { DeepSeekProvider } from './src/providers.mjs';
import { AnswerRouter } from './src/answer-router.mjs';
import { createApp } from './src/app.mjs';

const rootDir = dirname(fileURLToPath(import.meta.url));
const config = loadConfig(process.env, rootDir);
const presetStore = new JsonStore(join(config.dataDir, 'presets.json'), { items: [] });
const knowledgeStore = new JsonStore(join(config.dataDir, 'knowledge.json'), { items: [] });
const reviewStore = new JsonStore(join(config.dataDir, 'reviews.json'), { nextOrdinal: 1, items: [] });
const reviews = new ReviewRepository(reviewStore, knowledgeStore);
const provider = new DeepSeekProvider({ config });
const router = new AnswerRouter({ config, presetStore, knowledgeStore, reviews, provider });
const server = createServer(createApp({ router, reviews, publicDir: config.publicDir, demoMode: config.demoMode }));

function lanAddresses() {
  return Object.values(networkInterfaces())
    .flat()
    .filter((address) => address?.family === 'IPv4' && !address.internal)
    .map((address) => address.address);
}

server.listen(config.port, config.host, () => {
  console.log(`LIVE IN HDU 新生助手已启动（${config.demoMode ? '演示模式' : config.deepseekModel}）`);
  console.log(`电脑问答页：http://localhost:${config.port}`);
  console.log(`审核后台：http://localhost:${config.port}/admin`);
  for (const address of lanAddresses()) console.log(`手机局域网页：http://${address}:${config.port}`);
});

function stop() {
  server.close(() => process.exit(0));
}
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
