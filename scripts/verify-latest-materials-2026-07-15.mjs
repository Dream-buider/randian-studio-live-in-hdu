import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pageSpecs, skippedFiles, validateManifest } from './latest-materials-2026-07-15-manifest.mjs';

const root = process.cwd();
const sourceDir = path.join(root, '最新资料');
const reportDir = path.join(root, 'docs', '社区更新_2026-07-15');
const live = JSON.parse(fs.readFileSync(path.join(reportDir, 'feishu-upload-report-latest-materials.json'), 'utf8'));
const repair = JSON.parse(fs.readFileSync(path.join(reportDir, 'title-repair-report.json'), 'utf8'));
const dryRun = JSON.parse(fs.readFileSync(path.join(reportDir, 'publish-dry-run.json'), 'utf8'));

const validation = validateManifest({ sourceDir });
assert.deepEqual(validation, { sourceFileCount: 24, publishFileCount: 23, skippedFileCount: 1, pageCount: 7 });

const sourceNames = fs.readdirSync(sourceDir, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name).sort();
const publishedNames = pageSpecs.flatMap((spec) => spec.sections.flatMap((section) => section.files));
const skippedNames = skippedFiles.map((item) => item.filename);
assert.equal(new Set(publishedNames).size, 23, 'Published filenames must be unique.');
assert.equal(new Set(skippedNames).size, 1, 'Skipped filenames must be unique.');
assert.deepEqual([...publishedNames, ...skippedNames].sort(), sourceNames, 'Every source file must be published or explicitly skipped exactly once.');

assert.equal(live.mode, 'live');
assert.equal(live.pageCount, 7);
assert.equal(live.expectedFileCount, 23);
assert.equal(live.uploadedFileCount, 23);
assert.equal(live.missingFileCount, 0);
assert.equal(live.pageResults.length, 7);
for (const page of live.pageResults) {
  assert.equal(page.containsHeader, true, `${page.title} must contain the dated header marker.`);
  assert.deepEqual(page.missingAfterUpload, [], `${page.title} must have no missing attachment.`);
  assert.deepEqual([...page.uploaded].sort(), [...page.expectedFiles].sort(), `${page.title} upload set must equal expected set.`);
}

assert.equal(repair.targetCount, 6);
assert.equal(repair.verifiedCount, 6);
for (const item of repair.results) {
  assert.equal(item.verifiedTitle, item.title);
  assert.equal(item.removedSplitSuffix, true);
  assert.equal(item.suffixStillStandalone, false);
}

assert.equal(dryRun.pages.length, 7);
assert.equal(dryRun.pages.every((page) => page.existing && page.token), true, 'All seven exact-title nodes must exist after repair.');
for (const page of dryRun.pages) {
  const livePage = live.pageResults.find((item) => item.title === page.title);
  assert.ok(livePage, `Live report is missing ${page.title}.`);
  assert.equal(page.token, livePage.token, `${page.title} must resolve to the original node, not a duplicate.`);
  assert.ok(fs.statSync(livePage.screenshotPath).size > 10_000, `${page.title} screenshot must be non-empty.`);
}

const checklistPath = path.join(root, 'docs', '社区补充资料发布清单_2026-07-15.md');
const checklist = fs.readFileSync(checklistPath, 'utf8');
for (const page of live.pageResults) {
  assert.ok(checklist.includes(page.url), `Checklist must link ${page.title}.`);
}
assert.ok(checklist.includes('missingFileCount=0'));

console.log(JSON.stringify({
  sourceFileCount: sourceNames.length,
  publishedFileCount: publishedNames.length,
  skippedFileCount: skippedNames.length,
  livePageCount: live.pageResults.length,
  liveUploadedFileCount: live.uploadedFileCount,
  liveMissingFileCount: live.missingFileCount,
  repairedTitleCount: repair.verifiedCount,
  exactTitleNodeCount: dryRun.pages.filter((page) => page.existing).length,
  screenshotCount: live.pageResults.filter((page) => fs.existsSync(page.screenshotPath)).length,
}, null, 2));
