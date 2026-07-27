import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const presetPath = join(import.meta.dirname, '..', 'data', 'presets.json');

async function presets() {
  return JSON.parse(await readFile(presetPath, 'utf8')).items;
}

test('launch collection contains exactly forty unique stable intents', async () => {
  const items = await presets();
  assert.equal(items.length, 40);
  assert.equal(new Set(items.map((item) => item.id)).size, 40);
  assert.equal(new Set(items.map((item) => item.question)).size, 40);
  for (const item of items) {
    assert.match(item.id, /^[a-z][a-z0-9-]+$/);
    assert.ok(item.intentDescription.length >= 20, `${item.id} needs an intent description`);
    assert.ok(item.aliases.length >= 2, `${item.id} needs paraphrases`);
    assert.ok(item.keywords.length >= 2, `${item.id} needs keywords`);
  }
});

test('unreviewed collection intents cannot masquerade as approved answers', async () => {
  const items = await presets();
  for (const item of items) {
    assert.equal(item.answerStatus, 'collecting');
    assert.equal(item.answer, '');
    assert.deepEqual(item.sources, []);
  }
});

test('campus-card intent recognizes paraphrases while remaining distinct from loss handling', async () => {
  const items = await presets();
  const card = items.find((item) => item.id === 'campus-card-issue');
  assert.ok(card.aliases.includes('学校怎么办校园卡'));
  assert.ok(card.aliases.includes('一卡通去哪里领'));
  assert.ok(card.intentKeywords.includes('领取'));
  assert.ok(card.excludeKeywords.includes('挂失'));
});
