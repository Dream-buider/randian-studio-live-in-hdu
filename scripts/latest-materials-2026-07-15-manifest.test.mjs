import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import { pageSpecs, skippedFiles, validateManifest } from './latest-materials-2026-07-15-manifest.mjs';

const root = process.cwd();
const sourceDir = path.join(root, '最新资料');

test('manifest covers every source file exactly once', () => {
  const actual = fs.readdirSync(sourceDir).filter((name) => fs.statSync(path.join(sourceDir, name)).isFile()).sort();
  const covered = [...pageSpecs.flatMap((page) => page.sections.flatMap((section) => section.files)), ...skippedFiles.map((item) => item.filename)].sort();
  assert.deepEqual(covered, actual);
  assert.equal(new Set(covered).size, covered.length);
});

test('manifest validation accepts the current batch', () => {
  assert.deepEqual(validateManifest({ sourceDir }), { sourceFileCount: 24, publishFileCount: 23, skippedFileCount: 1, pageCount: 7 });
});

test('every page has a stable parent, disclaimer and section', () => {
  for (const page of pageSpecs) {
    assert.match(page.parentToken, /^[A-Za-z0-9]{20,}$/);
    assert.ok(page.title.length > 4);
    assert.ok(page.note.length > 15);
    assert.ok(page.sections.length > 0);
  }
});

test('near duplicate is excluded with a concrete reason', () => {
  assert.deepEqual(skippedFiles.map((item) => item.filename), ['嵌入式复习材料(1).docx']);
  assert.match(skippedFiles[0].reason, /99\.3%/);
});
