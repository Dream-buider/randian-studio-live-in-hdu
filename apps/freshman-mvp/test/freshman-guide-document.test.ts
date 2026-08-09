import assert from 'node:assert/strict';
import test from 'node:test';
import { FRESHMAN_GUIDE_URL } from '../src/content/freshman-guide.js';
import { parseFreshmanGuideMarkdown } from '../src/content/freshman-guide-document.js';

const longPreparationContent = [
  '第一段长内容'.repeat(130),
  '第二段长内容'.repeat(130),
].join('\n\n');

const markdown = `
审批元数据不应成为可检索内容。

## 开学准备篇

### 1.杭电の绑定（拿到学号后）

#### 1.1学号班级号获取教程

在智慧杭电中查询自己的学号和班级号。

#### 1.2 原文图片未转录

原文图片未转录

#### 1.3钉钉杭州电子科技大学认证：

完成学校钉钉认证后再查看通知。

### 长段说明

${longPreparationContent}

## 生活篇

### 图书馆使用

图书馆预约和借阅规则以现场通知为准。

## 助学政策篇

### 助学政策

国家助学金申请以学校当年通知为准。
`;

test('parser retains the major-section heading path and approved source for a subsection', () => {
  const chunks = parseFreshmanGuideMarkdown(markdown);

  assert.deepEqual(chunks[0].titlePath, [
    '开学准备篇',
    '1.杭电の绑定（拿到学号后）',
    '1.1学号班级号获取教程',
  ]);
  assert.equal(chunks[0].sectionId, 'preparation');
  assert.match(chunks[0].source.url, /#JDfOd4Qt1o5MirxLrh5cI4Z8nud$/);
});

test('parser drops image-only paragraphs and gives aid subsections a specific root source', () => {
  const chunks = parseFreshmanGuideMarkdown(markdown);

  assert.equal(chunks.some((chunk) => chunk.content.includes('原文图片未转录')), false);

  assert.equal(chunks.at(-1)?.sectionId, 'aid');
  assert.equal(chunks.at(-1)?.source.url, FRESHMAN_GUIDE_URL);
  assert.equal(chunks.at(-1)?.source.title, '杭电新生指北 · 助学政策');
});

test('parser splits long content at paragraph boundaries and promotes life facilities to campus', () => {
  const chunks = parseFreshmanGuideMarkdown(markdown);

  const longChunks = chunks.filter((chunk) => chunk.displayTitle.includes('长段'));
  assert.equal(longChunks.length, 2);
  assert.ok(longChunks.every((chunk) => [...chunk.content].length <= 1_200));
  assert.match(longChunks[0].id, /-part-1-[a-f0-9]{16}$/);
  assert.match(longChunks[1].id, /-part-2-[a-f0-9]{16}$/);

  const libraryChunk = chunks.find((chunk) => chunk.displayTitle.includes('图书馆'));
  assert.equal(libraryChunk?.sectionId, 'campus');
  assert.match(libraryChunk?.source.url ?? '', /#F5hHdXMamok8Eux3E84cPWn1nQg$/);
});
