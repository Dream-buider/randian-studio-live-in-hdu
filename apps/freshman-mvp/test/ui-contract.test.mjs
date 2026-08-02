import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

const publicDir = join(import.meta.dirname, '..', 'public');

test('mobile page exposes the ask form, quick questions and answer regions', async () => {
  const html = await readFile(join(publicDir, 'index.html'), 'utf8');
  assert.match(html, /id="ask-form"/);
  assert.match(html, /id="question"/);
  assert.match(html, /data-quick-question/);
  assert.match(html, /id="answer-feed"/);
  assert.match(html, /data-role="disclaimer"/);
  assert.match(html, /href="\/admin"/);
});

test('admin page exposes FIFO list and review actions', async () => {
  const html = await readFile(join(publicDir, 'admin.html'), 'utf8');
  assert.match(html, /id="review-list"/);
  assert.match(html, /id="status-filter"/);
  assert.match(html, /data-action="approve"/);
  assert.match(html, /data-action="reject"/);
  assert.match(html, /最早提问优先/);
});

test('browser scripts use textContent instead of interpolating answer HTML', async () => {
  const app = await readFile(join(publicDir, 'app.js'), 'utf8');
  const admin = await readFile(join(publicDir, 'admin.js'), 'utf8');
  assert.doesNotMatch(app, /innerHTML\s*=/);
  assert.doesNotMatch(admin, /innerHTML\s*=/);
  assert.match(app, /textContent/);
  assert.match(admin, /textContent/);
});
