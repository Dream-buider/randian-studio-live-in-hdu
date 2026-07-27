import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_DISCLAIMER, loadConfig } from '../src/config.mjs';
import { bestMatch, normalizeText } from '../src/matching.mjs';
import { JsonStore } from '../src/json-store.mjs';

test('configuration keeps the exact required disclaimer and defaults to demo mode', () => {
  const config = loadConfig({}, 'C:/demo');
  assert.equal(
    DEFAULT_DISCLAIMER,
    '该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别',
  );
  assert.equal(config.disclaimer, DEFAULT_DISCLAIMER);
  assert.equal(config.demoMode, true);
  assert.equal(config.deepseekModel, 'deepseek-v4-flash');
  assert.equal(config.intentConfidence, 0.78);
});

test('configuration switches to live DeepSeek mode when a key is present', () => {
  const config = loadConfig({ DEEPSEEK_API_KEY: 'secret', DATA_DIR: 'D:/mvp-data' }, 'C:/demo');
  assert.equal(config.demoMode, false);
  assert.equal(config.deepseekApiKey, 'secret');
  assert.equal(config.dataDir, 'D:/mvp-data');
});

test('normalizeText removes punctuation, spaces and letter case differences', () => {
  assert.equal(normalizeText(' 转专业，怎么弄？ ABC '), '转专业怎么弄abc');
});

test('bestMatch prefers exact and close preset questions', () => {
  const entries = [
    { id: 'dorm', question: '宿舍是几人间', aliases: ['寝室住几个人'], keywords: ['宿舍', '寝室', '几人间'] },
    { id: 'major', question: '如何申请转专业', aliases: ['怎么转专业'], keywords: ['转专业', '申请'] },
  ];
  assert.equal(bestMatch('我想问一下怎么转专业', entries, 0.45)?.entry.id, 'major');
  assert.equal(bestMatch('寝室住几个人', entries, 0.45)?.entry.id, 'dorm');
  assert.equal(bestMatch('杭州今天天气', entries, 0.65), null);
});

test('bestMatch respects intent exclusions so adjacent intents do not collide', () => {
  const entries = [{
    id: 'campus-card-issue',
    question: '校园卡如何领取、激活、充值和使用',
    aliases: ['学校怎么办校园卡', '一卡通去哪里领'],
    keywords: ['校园卡', '一卡通', '领取'],
    intentKeywords: ['领取', '办理', '激活', '充值'],
    excludeKeywords: ['挂失', '丢', '补卡'],
  }];
  assert.equal(bestMatch('学校怎么办校园卡', entries, 0.45)?.entry.id, 'campus-card-issue');
  assert.equal(bestMatch('我的校园卡丢了怎么挂失', entries, 0.2), null);
});

test('JsonStore persists updates and returns isolated values', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hdu-mvp-'));
  const path = join(dir, 'store.json');
  const store = new JsonStore(path, { nextOrdinal: 1, items: [] });

  const result = await store.update((state) => {
    state.items.push({ id: 'one' });
    state.nextOrdinal += 1;
    return state.nextOrdinal;
  });

  assert.equal(result, 2);
  assert.deepEqual(await store.read(), { nextOrdinal: 2, items: [{ id: 'one' }] });
  const raw = JSON.parse(await readFile(path, 'utf8'));
  assert.equal(raw.items[0].id, 'one');

  const copy = await store.read();
  copy.items.push({ id: 'mutated-copy' });
  assert.equal((await store.read()).items.length, 1);
});
