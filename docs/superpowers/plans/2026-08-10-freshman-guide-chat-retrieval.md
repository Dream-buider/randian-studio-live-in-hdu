# 《杭电新生指北》聊天检索 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让聊天问答在不覆盖人工答案、不改变审核队列和客户端协议的前提下，优先检索已批准的《杭电新生指北》Markdown，返回受约束总结及最多三个可点击的飞书章节链接。

**Architecture:** 在服务启动时读取应用目录外、由 `FRESHMAN_GUIDE_PATH` 指定的私有 Markdown，解析为带标题路径、章节深链和稳定 ID 的内存片段；专用检索器先做确定性召回，再由 TokenDance 在候选片段内选择并总结。`AnswerRouter` 按“人工预设并补充指北 → 指北 → 既有知识库 → 联网检索与审核队列”路由，模型只返回片段 ID 和答案，最终链接始终由服务端元数据生成。

**Tech Stack:** Node.js 24、TypeScript 6、Fastify 5、Vue 3、Node test runner、Vitest、SQLite（只读回归核对）、systemd、PowerShell/SSH。

## Global Constraints

- 完整《杭电新生指北》正文不得提交到 Git、前端构建产物或整篇返回给客户端。
- 第一版不部署 WeKnora，不增加数据库表，不修改现有管理员鉴权边界。
- 人工审核预设答案必须保持正文原样，只能在其后追加独立的“《杭电新生指北》补充”段落。
- 指北命中时最多返回三个去重后的指北来源，链接只能来自服务端批准的飞书根链接或章节深链。
- 指北命中但 TokenDance 失败时必须返回确定性摘要；指北文件缺失或解析失败时不得阻塞主服务。
- 指北未命中时保持现有本地知识库、SearXNG、DeepSeek 和 FIFO 审核队列流程。
- 不得使用真实待审核任务做自动化验收，不得重建、清空或覆盖现有 SQLite 数据库。
- 云端部署前必须备份代码、`.env.local`、SQLite 数据库和当前指北文件；失败时恢复原构建与配置。
- SearXNG 继续只监听 `127.0.0.1:8888`；公网 `/api/reviews` 必须继续返回 403。

---

## File Structure

### New files

- `apps/freshman-mvp/src/content/freshman-guide-document.ts` — 解析已批准 Markdown，生成稳定、可检索但不对外整篇暴露的指北片段。
- `apps/freshman-mvp/src/providers/freshman-guide-provider.ts` — 对问题做归一化、别称扩展、确定性评分、阈值过滤和最多八条候选召回。
- `apps/freshman-mvp/test/freshman-guide-document.test.ts` — 验证标题路径、占位内容过滤、长段切分、章节链接和稳定 ID。
- `apps/freshman-mvp/test/freshman-guide-provider.test.ts` — 验证别称、错别字、排序、泛化问题拒绝、候选上限和故障状态。
- `apps/freshman-mvp/test/web/chat-guide-sources.test.ts` — 验证聊天页把指北来源单独显示为安全可点击链接。
- `apps/freshman-mvp/scripts/verify-freshman-guide.mts` — 在部署前读取私有文件并运行固定问题集，只输出命中标题、数量和 URL，不输出正文。

### Modified files

- `apps/freshman-mvp/src/content/freshman-guide.ts` — 集中维护章节 ID、公开标题、批准深链、匹配别称和根链接回退规则。
- `apps/freshman-mvp/src/providers/contracts.ts` — 增加结构化指北选择/总结输入输出，不改变 `AnswerResult` 和 `SourceRef`。
- `apps/freshman-mvp/src/providers/tokendance-provider.ts` — 增加候选内 JSON 选择与总结，过滤未知片段 ID，不接受模型 URL。
- `apps/freshman-mvp/src/services/answer-router.ts` — 接入独立指北提供者并实现四级路由优先级、预设补充和故障回退。
- `apps/freshman-mvp/src/server/config.ts` — 读取并解析 `FRESHMAN_GUIDE_PATH`。
- `apps/freshman-mvp/src/server/index.ts` — 安全加载指北文件、组合提供者并暴露诚实健康状态。
- `apps/freshman-mvp/web/views/ChatView.vue` — 复用 `SourceList`，将指北来源以“继续阅读《杭电新生指北》”分组显示。
- `apps/freshman-mvp/web/api.ts` — 将 `freshmanGuide` 作为健康信息中的可选组件，兼容旧服务响应。
- `apps/freshman-mvp/.env.example` — 文档化私有指北路径，不填写生产绝对路径或密钥。
- `apps/freshman-mvp/package.json` — 增加只读指北校验命令。
- `apps/freshman-mvp/test/baseline.test.ts` — 验证配置默认值与显式路径。
- `apps/freshman-mvp/test/tokendance-provider.test.ts` — 验证结构化选择、未知 ID、空答案和不泄露链接/检索元数据。
- `apps/freshman-mvp/test/answer-router-v2.test.ts` — 验证预设补充、指北独立命中、后续路由和审核队列不变。
- `apps/freshman-mvp/test/e2e-v2.test.ts` — 验证生产组合、健康状态和完整 HTTP 路由。
- `apps/freshman-mvp/test/web/admin.test.ts` — 让健康响应 fixture 接受并显示或忽略新组件，保证管理端不受影响。

---

### Task 1: 配置私有指北路径

**Files:**
- Modify: `apps/freshman-mvp/src/server/config.ts:3-58`
- Modify: `apps/freshman-mvp/test/baseline.test.ts:1-55`
- Modify: `apps/freshman-mvp/.env.example:1-25`

**Interfaces:**
- Produces: `AppConfig.freshmanGuidePath: string | null`
- Rule: 空白或未设置 `FRESHMAN_GUIDE_PATH` 返回 `null`；非空值通过 `path.resolve(appRoot, value)` 解析，绝对路径保持绝对。

- [ ] **Step 1: Write the failing configuration tests**

在 `test/baseline.test.ts` 的默认配置测试中加入：

```ts
assert.equal(config.freshmanGuidePath, null);
```

再增加：

```ts
test('resolves an explicit private freshman guide path without enabling WeKnora', () => {
  const config = loadConfig({
    FRESHMAN_GUIDE_PATH: '../../approved-knowledge/hdu-freshman-guide-2026.md',
  }, 'C:/project/apps/freshman-mvp');
  assert.match(
    config.freshmanGuidePath ?? '',
    /project[\\/]approved-knowledge[\\/]hdu-freshman-guide-2026\.md$/,
  );
  assert.equal(config.knowledgeProvider, 'local');
});
```

- [ ] **Step 2: Run the focused test and verify the new assertions fail**

Run: `cd apps/freshman-mvp && npx tsx --test test/baseline.test.ts`

Expected: FAIL because `freshmanGuidePath` does not exist on `AppConfig`.

- [ ] **Step 3: Add the minimal configuration field**

在 `AppConfig` 中加入：

```ts
freshmanGuidePath: string | null;
```

在 `loadConfig()` 的返回对象中加入：

```ts
freshmanGuidePath: env.FRESHMAN_GUIDE_PATH?.trim()
  ? path.resolve(appRoot, env.FRESHMAN_GUIDE_PATH.trim())
  : null,
```

在 `.env.example` 的知识库配置前加入：

```dotenv
# 已人工批准的私有《杭电新生指北》Markdown；不要提交正文到 Git。
FRESHMAN_GUIDE_PATH=
```

- [ ] **Step 4: Run the focused test**

Run: `cd apps/freshman-mvp && npx tsx --test test/baseline.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit only this task**

```powershell
git add apps/freshman-mvp/src/server/config.ts apps/freshman-mvp/test/baseline.test.ts apps/freshman-mvp/.env.example
git commit -m "feat: configure private freshman guide path"
```

---

### Task 2: 解析已批准 Markdown 并生成服务端来源

**Files:**
- Create: `apps/freshman-mvp/src/content/freshman-guide-document.ts`
- Modify: `apps/freshman-mvp/src/content/freshman-guide.ts:1-76`
- Create: `apps/freshman-mvp/test/freshman-guide-document.test.ts`
- Modify: `apps/freshman-mvp/test/weknora-provider.test.ts:1-47`

**Interfaces:**
- Produces:

```ts
export type FreshmanGuideSectionId = 'preparation' | 'dormitory' | 'life' | 'campus' | 'aid';

export interface FreshmanGuideChunk {
  id: string;
  titlePath: readonly string[];
  displayTitle: string;
  content: string;
  sectionId: FreshmanGuideSectionId;
  sequence: number;
  source: SourceRef;
}

export function parseFreshmanGuideMarkdown(markdown: string): FreshmanGuideChunk[];
export function sourceForGuideHeading(sectionId: FreshmanGuideSectionId, displayTitle: string): SourceRef;
```

- Parsing rule: `##` only changes the major-section context; `###`、`####`、`#####` start retrievable chunks. Blank bodies, metadata before the first `##`, horizontal rules, and paragraphs containing `原文图片未转录` are excluded.
- Section rule: `开学准备篇` → `preparation`、`宿舍篇` → `dormitory`、`生活篇` → `life`、`助学政策篇` → `aid`；当生活篇标题路径包含 `图书馆`、`教学楼`、`体育场` 或 `月雅湖` 时覆盖为 `campus`，使用教学区与校园设施深链。
- Chunking rule: normalized content longer than 1,200 Unicode code points is split at blank-paragraph boundaries into pieces no longer than 1,200 where possible; each piece retains the same title path and receives ID suffix `-part-1`, `-part-2`.
- Stable ID rule: slug is derived from normalized section ID plus heading path and part number, independent of source file location.
- Source title rule: every chunk source title is exactly `杭电新生指北 · ${displayTitle}`; `displayTitle` is the cleaned nearest retrievable heading, so the user sees a specific subsection name even when its URL falls back to a major section or root page.

- [ ] **Step 1: Write parser tests using an inline fixture**

创建 `test/freshman-guide-document.test.ts`，fixture 至少包含 `## 开学准备篇`、`#### 1.1学号班级号获取教程`、`#### 1.3钉钉杭州电子科技大学认证`、一个 `原文图片未转录` 段落、一个超过 1,200 字符的段落和 `## 助学政策篇`。断言：

```ts
const chunks = parseFreshmanGuideMarkdown(markdown);
assert.deepEqual(chunks[0].titlePath, [
  '开学准备篇',
  '1.杭电の绑定（拿到学号后）',
  '1.1学号班级号获取教程',
]);
assert.equal(chunks[0].sectionId, 'preparation');
assert.match(chunks[0].source.url, /#JDfOd4Qt1o5MirxLrh5cI4Z8nud$/);
assert.equal(chunks.some((chunk) => chunk.content.includes('原文图片未转录')), false);
assert.equal(chunks.filter((chunk) => chunk.displayTitle.includes('长段')).length, 2);
assert.equal(chunks.at(-1)?.sectionId, 'aid');
assert.equal(chunks.at(-1)?.source.url, FRESHMAN_GUIDE_URL);
```

- [ ] **Step 2: Run the new test and verify import failure**

Run: `cd apps/freshman-mvp && npx tsx --test test/freshman-guide-document.test.ts`

Expected: FAIL with module/function not found.

- [ ] **Step 3: Centralize section metadata and aliases**

扩展 `freshman-guide.ts`，为五类章节提供 `headingTerms` 和批准 URL；`aid` 使用根链接。增加明确别称：

```ts
export const FRESHMAN_GUIDE_ALIASES: Readonly<Record<string, readonly string[]>> = {
  '学号班级号获取': ['学号怎么查', '学号在哪看', '班级号在哪看'],
  '钉钉杭州电子科技大学认证': ['航电钉', '杭电钉', '学校钉钉', '钉钉认证'],
  '宿舍类型': ['宿舍大小', '寝室多大', '几人间'],
};
```

`sourceForGuideHeading()` 只能从常量映射取 URL；找不到大章节时回退 `FRESHMAN_GUIDE_URL`，不得拼接模型或文档提供的锚点。

- [ ] **Step 4: Implement the Markdown state machine and deterministic splitting**

在 `freshman-guide-document.ts` 中逐行维护 `h2`、`h3`、`h4`、`h5` 标题栈；遇到新标题或 EOF 时 flush 当前正文。标题显示前移除序号和末尾冒号，但 `titlePath` 保留清理后的层级。使用 `node:crypto` 的 SHA-256 对 `sectionId + '\0' + titlePath.join('\0') + '\0' + partNumber` 取前 16 位作为 ID 后缀。

- [ ] **Step 5: Run parser and existing source tests**

Run: `cd apps/freshman-mvp && npx tsx --test test/freshman-guide-document.test.ts test/weknora-provider.test.ts`

Expected: PASS；原有宿舍深链测试仍通过，助学内容现在明确回退根链接。

- [ ] **Step 6: Commit only parser and metadata files**

```powershell
git add apps/freshman-mvp/src/content/freshman-guide-document.ts apps/freshman-mvp/src/content/freshman-guide.ts apps/freshman-mvp/test/freshman-guide-document.test.ts apps/freshman-mvp/test/weknora-provider.test.ts
git commit -m "feat: parse approved freshman guide markdown"
```

---

### Task 3: 实现轻量确定性指北检索

**Files:**
- Create: `apps/freshman-mvp/src/providers/freshman-guide-provider.ts`
- Create: `apps/freshman-mvp/test/freshman-guide-provider.test.ts`

**Interfaces:**
- Consumes: `FreshmanGuideChunk[]` from Task 2.
- Produces:

```ts
export interface FreshmanGuideProviderOptions {
  chunks: readonly FreshmanGuideChunk[];
  maxHits?: number;
  minimumScore?: number;
}

export class FreshmanGuideProvider implements KnowledgeProvider {
  constructor(options: FreshmanGuideProviderOptions);
  search(question: string): Promise<KnowledgeSearchResult>;
  status(): { status: 'available' | 'not-configured' | 'configuration-error'; chunks: number };
}
```

- Output mapping: `knowledgeId='freshman-guide-2026'`、`chunkId=chunk.id`、`title='杭电新生指北'`、`sourceType='community'`、`source=chunk.source`。
- Score rule: exact alias `+1.0`、display title token `+0.45` each、title-path token `+0.30` each、body token `+0.08` each; cap at `1.0`; default threshold `0.42`; order by score descending then sequence ascending; at most eight hits.
- Generic tokens `学校`、`大学`、`杭电`、`怎么办`、`怎么`、`什么`、`情况`、`可以` do not contribute. A question with no non-generic term returns an available miss.

- [ ] **Step 1: Write deterministic retrieval tests**

使用三到五个手工 `FreshmanGuideChunk`，覆盖：

```ts
assert.equal((await provider.search('航电钉怎么注册？')).hits[0].chunkId, 'dingtalk');
assert.equal((await provider.search('学校钉钉怎么认证？')).hits[0].chunkId, 'dingtalk');
assert.equal((await provider.search('寝室多大，是几人间？')).hits[0].chunkId, 'dorm-type');
assert.deepEqual((await provider.search('学校怎么办？')).hits, []);
assert.equal((await manyProvider.search('宿舍')).hits.length, 8);
```

同时断言相同输入重复检索顺序一致，`chunks=[]` 时状态为 `not-configured` 且不抛错。

- [ ] **Step 2: Run the new provider test and verify failure**

Run: `cd apps/freshman-mvp && npx tsx --test test/freshman-guide-provider.test.ts`

Expected: FAIL because provider module does not exist.

- [ ] **Step 3: Implement normalization, token extraction, aliases and scoring**

归一化必须执行 `NFKC`、小写化、移除空白/标点；先把问题命中的别称映射为规范标题词，再评分。不要安装分词或向量依赖；对中文使用已批准关键词、连续双字片段和标题包含关系。

- [ ] **Step 4: Run focused tests**

Run: `cd apps/freshman-mvp && npx tsx --test test/freshman-guide-provider.test.ts test/freshman-guide-document.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the provider**

```powershell
git add apps/freshman-mvp/src/providers/freshman-guide-provider.ts apps/freshman-mvp/test/freshman-guide-provider.test.ts
git commit -m "feat: add deterministic freshman guide retrieval"
```

---

### Task 4: 让 TokenDance 只在候选片段内选择和总结

**Files:**
- Modify: `apps/freshman-mvp/src/providers/contracts.ts:32-72`
- Modify: `apps/freshman-mvp/src/providers/tokendance-provider.ts:1-285`
- Modify: `apps/freshman-mvp/test/tokendance-provider.test.ts`

**Interfaces:**
- Produces:

```ts
export interface GuideSynthesisInput {
  question: string;
  hits: KnowledgeHit[];
}

export interface GuideSynthesisResult {
  text: string;
  selectedChunkIds: string[];
}

export interface ModelProvider {
  // existing methods remain unchanged
  synthesizeGuide?(input: GuideSynthesisInput): Promise<GuideSynthesisResult>;
}
```

- Model response schema: `{"answer":"简洁中文回答","selectedChunkIds":["candidate-id"]}`.
- Validation: `answer` must be a nonblank string; IDs must be strings, unique, present in input candidates, and limited to three. Unknown IDs are discarded; no remaining known ID means the method throws `ServiceUnavailableError` so the router uses deterministic fallback.
- The request body sends only `id`、`title`、`content`; it never sends source URL、score、knowledge ID or API key in prompt text.

- [ ] **Step 1: Add failing structured-synthesis tests**

在 `tokendance-provider.test.ts` 增加四个 cases：

```ts
const result = await provider.synthesizeGuide({ question, hits });
assert.deepEqual(result, {
  text: '先获取学号，再完成钉钉杭电认证。',
  selectedChunkIds: ['student-id', 'dingtalk'],
});
```

另断言：(a) `['known','unknown','known']` 只留下 `['known']`；(b) 全部未知 ID 抛出通用服务错误；(c) 空 answer 抛错；(d) 序列化请求不包含 `https://`、`knowledgeId`、`score`、`apiKey`。

- [ ] **Step 2: Run the focused test and verify missing method/types**

Run: `cd apps/freshman-mvp && npx tsx --test test/tokendance-provider.test.ts`

Expected: FAIL because `synthesizeGuide` and its contracts do not exist.

- [ ] **Step 3: Implement strict JSON parsing and candidate filtering**

增加纯函数：

```ts
function guideSynthesisFromContent(
  content: string,
  allowedIds: Set<string>,
): GuideSynthesisResult | null;
```

`synthesizeGuide()` 使用温度 `0.1`、`max_tokens=900`，系统提示明确写出“只使用输入片段；不得输出 URL；不得补充其他学校或未给出的杭电事实；必须返回单个 JSON 对象”。解析失败、空答案或无合法 ID 时抛出不含响应正文的 `ServiceUnavailableError`。

- [ ] **Step 4: Run TokenDance tests**

Run: `cd apps/freshman-mvp && npx tsx --test test/tokendance-provider.test.ts`

Expected: PASS；已有意图分类、联网总结和知识总结测试仍通过。

- [ ] **Step 5: Commit the model contract**

```powershell
git add apps/freshman-mvp/src/providers/contracts.ts apps/freshman-mvp/src/providers/tokendance-provider.ts apps/freshman-mvp/test/tokendance-provider.test.ts
git commit -m "feat: constrain guide synthesis to retrieved chunks"
```

---

### Task 5: 实现预设优先的四级问答路由

**Files:**
- Modify: `apps/freshman-mvp/src/services/answer-router.ts:1-245`
- Modify: `apps/freshman-mvp/test/answer-router-v2.test.ts`

**Interfaces:**
- Consumes: optional `guideKnowledge?: KnowledgeProvider` and optional `model.synthesizeGuide()`.
- Produces: existing `AnswerResult`; no API schema change.
- Private helper result:

```ts
interface GuideAnswer {
  text: string;
  sources: SourceRef[];
}
```

- Source rule: map only selected server-side hits, de-duplicate by `title + '\0' + url`, preserve hit order, and slice to three.
- Deterministic fallback rule: for each of the top three hits, extract the first two nonblank Chinese sentence units (`。！？；` delimiters), join to at most 700 Unicode code points, and keep the corresponding sources.

- [ ] **Step 1: Extend the router test helper with an optional guide provider**

给 `makeRouter()` 增加 `guideKnowledge` 参数，默认值是：

```ts
{ async search() { return { status: 'not-configured', hits: [] }; } }
```

这样现有测试不改变行为，也不要求每个 fixture 都新增字段。

- [ ] **Step 2: Add failing route-priority tests**

增加并明确断言以下行为：

1. 预设命中：`result.answer.startsWith(originalPreset.fullAnswer)`；追加文本包含 `《杭电新生指北》补充`；`route='preset'`、`trustStatus='approved'`、`intentId` 不变。
2. 仅指北命中：`route='knowledge'`、无 `disclaimer`、审核仓库 `enqueue` 调用次数为 0。
3. 模型选择两个已知 ID 和一个未知 ID：只返回两个服务端来源。
4. 模型抛错：仍返回确定性指北摘要和链接。
5. 指北未命中：既有本地 knowledge 仍优先于 web。
6. 指北与既有 knowledge 都未命中：仍返回 web 批注并只创建一条审核任务。
7. 指北提供者抛错：预设仍正常返回；非预设继续后续链路。

- [ ] **Step 3: Run focused route tests and verify failures**

Run: `cd apps/freshman-mvp && npx tsx --test test/answer-router-v2.test.ts`

Expected: new guide-related tests FAIL while existing route tests remain green.

- [ ] **Step 4: Implement `resolveGuideAnswer(question)`**

步骤必须是：捕获 `guideKnowledge.search()` 异常 → 规范化 hits → 若存在 `synthesizeGuide` 则验证返回 ID 并选片段 → 不可用时走确定性摘要 → 根据最终片段生成最多三个来源。绝不采用模型返回的来源。

- [ ] **Step 5: Wire the exact routing order**

将 `answer()` 改为：

```ts
const preset = await this.deps.intentMatcher.match(question, intents, published);
if (preset) {
  const guide = await this.resolveGuideAnswer(question);
  return {
    route: 'preset',
    trustStatus: 'approved',
    answer: guide
      ? `${preset.fullAnswer}\n\n《杭电新生指北》补充：${guide.text}`
      : preset.fullAnswer,
    sources: mergePresetAndGuideSources(preset.sources, guide?.sources ?? []),
    intentId: preset.id,
  };
}
const guide = await this.resolveGuideAnswer(question);
if (guide) {
  return { route: 'knowledge', trustStatus: 'knowledge', answer: guide.text, sources: guide.sources };
}
// existing knowledge and web branches follow unchanged
```

`mergePresetAndGuideSources()` 保留全部原预设来源；仅对新增指北来源去重并限制三个。

- [ ] **Step 6: Run router tests**

Run: `cd apps/freshman-mvp && npx tsx --test test/answer-router-v2.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit the routing behavior without staging unrelated dirty files**

先运行 `git diff -- apps/freshman-mvp/src/services/answer-router.ts apps/freshman-mvp/test/answer-router-v2.test.ts`，确认只含本任务更改，再执行：

```powershell
git add apps/freshman-mvp/src/services/answer-router.ts apps/freshman-mvp/test/answer-router-v2.test.ts
git commit -m "feat: prioritize freshman guide in chat routing"
```

---

### Task 6: 在生产组合中安全加载私有指北并报告健康状态

**Files:**
- Modify: `apps/freshman-mvp/src/server/index.ts:1-412`
- Modify: `apps/freshman-mvp/test/e2e-v2.test.ts`
- Modify: `apps/freshman-mvp/web/api.ts:96-120,288-330`
- Modify: `apps/freshman-mvp/test/web/admin.test.ts`

**Interfaces:**
- Produces health component:

```ts
freshmanGuide?: {
  status: 'available' | 'not-configured' | 'configuration-error';
  mode: 'private-markdown';
  chunks: number;
};
```

- Startup rule: missing/unreadable/empty-invalid file creates a disabled `FreshmanGuideProvider({ chunks: [] })`; it never rejects `createProductionRuntime()`.

- [ ] **Step 1: Add failing production-composition tests**

在临时测试目录写入一份小型 `approved-guide.md`，通过 `FRESHMAN_GUIDE_PATH` 配置，断言 `/api/health` 包含：

```ts
freshmanGuide: { status: 'available', mode: 'private-markdown', chunks: 2 }
```

再用不存在的路径创建 runtime，断言服务仍能启动且状态为 `configuration-error`、`chunks: 0`，预设 `/api/ask` 仍返回 200。

- [ ] **Step 2: Run the E2E test and verify failure**

Run: `cd apps/freshman-mvp && npx tsx --test test/e2e-v2.test.ts`

Expected: FAIL because runtime does not load the guide and health lacks `freshmanGuide`.

- [ ] **Step 3: Add a non-throwing loader in `server/index.ts`**

实现：

```ts
async function loadFreshmanGuide(pathname: string | null): Promise<{
  provider: FreshmanGuideProvider;
  status: 'available' | 'not-configured' | 'configuration-error';
}>;
```

未配置返回 `not-configured`；读取和解析成功且 chunks 非空返回 `available`；任何异常或空 chunks 返回 `configuration-error`。不要记录 Markdown 正文或异常对象，只允许记录固定状态词。

- [ ] **Step 4: Inject `guideKnowledge` and add health data**

在创建普通 `knowledge` 之前创建 guide provider，并把它作为 `guideKnowledge` 传给 `AnswerRouter`。在 `/api/health` 的 `components` 中加入 `freshmanGuide`。不要改变 `knowledge`、`weknora`、`search` 或 `reviewQueue` 字段语义。

- [ ] **Step 5: Make the browser health type backward compatible**

在 `web/api.ts` 将 `freshmanGuide` 定义为可选字段；`isSystemHealth()` 只在字段存在时校验其三个属性。管理端 fixture 加入该字段，但管理端页面本轮不增加运维按钮。

- [ ] **Step 6: Run server and admin tests**

Run: `cd apps/freshman-mvp && npx tsx --test test/e2e-v2.test.ts && npx vitest run test/web/admin.test.ts`

Expected: PASS；没有指北字段的旧 health fixture 也仍能解析。

- [ ] **Step 7: Commit production composition**

```powershell
git add apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/test/e2e-v2.test.ts apps/freshman-mvp/web/api.ts apps/freshman-mvp/test/web/admin.test.ts
git commit -m "feat: load private freshman guide at startup"
```

---

### Task 7: 在聊天页区分指北链接与其他来源

**Files:**
- Modify: `apps/freshman-mvp/web/views/ChatView.vue:1-175`
- Create: `apps/freshman-mvp/test/web/chat-guide-sources.test.ts`

**Interfaces:**
- Consumes: unchanged `AnswerResult.sources: SourceRef[]`.
- Produces two derived lists:

```ts
function isGuideSource(source: SourceRef): boolean {
  return source.type === 'community' && source.title.includes('新生指北');
}

const guideSources = computed(() => dedupeSources(
  result.value?.sources.filter(isGuideSource) ?? [],
).slice(0, 3));

const otherSources = computed(() => dedupeSources(
  result.value?.sources.filter((source) => !isGuideSource(source)) ?? [],
));
```

- [ ] **Step 1: Write the failing Vue test**

挂载 `ChatView`，mock `/api/ask` 返回四个指北来源（其中一个重复）和一个官网来源。断言：

```ts
expect(wrapper.get('[aria-label="继续阅读《杭电新生指北》"]').findAll('a')).toHaveLength(3);
expect(wrapper.get('a[href$="#JDfOd4Qt1o5MirxLrh5cI4Z8nud"]').attributes('target')).toBe('_blank');
expect(wrapper.get('[aria-label="参考资料"]').text()).toContain('杭电官网');
expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
```

- [ ] **Step 2: Run the focused web test and verify failure**

Run: `cd apps/freshman-mvp && npx vitest run test/web/chat-guide-sources.test.ts`

Expected: FAIL because the page currently renders one undivided `参考资料` list.

- [ ] **Step 3: Add computed grouping without changing chat bubbles**

导入 `computed`，加入按 `type/title/url` 去重函数。将原单个：

```vue
<SourceList :sources="result.sources" heading="参考资料" />
```

替换为：

```vue
<SourceList :sources="guideSources" heading="继续阅读《杭电新生指北》" />
<SourceList :sources="otherSources" heading="参考资料" />
```

不增加弹窗、不改变用户/AI 气泡和等待动画。

- [ ] **Step 4: Run chat and guide UI tests**

Run: `cd apps/freshman-mvp && npx vitest run test/web/chat-guide-sources.test.ts test/web/guide-view.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the UI grouping**

```powershell
git add apps/freshman-mvp/web/views/ChatView.vue apps/freshman-mvp/test/web/chat-guide-sources.test.ts
git commit -m "feat: present guide links in chat answers"
```

---

### Task 8: 增加不泄露正文的部署前校验器

**Files:**
- Create: `apps/freshman-mvp/scripts/verify-freshman-guide.mts`
- Modify: `apps/freshman-mvp/package.json:6-18`
- Create: `apps/freshman-mvp/test/freshman-guide-verify-script.test.ts`

**Interfaces:**
- CLI: `npm run verify:guide -- --file <absolute-markdown-path>`
- Exit 0: file parses, fixed relevant questions hit, fixed unrelated question misses, every returned URL starts with the approved Feishu root.
- Exit 1: file missing, parse empty, a relevant question misses, unrelated question hits, or any URL is outside the approved root.
- Output: one line per question with `question | hit-count | display-title | url`; never print `content`.

- [ ] **Step 1: Write a failing CLI test**

测试创建临时 Markdown，通过 child process 运行脚本，断言 exit code 0、输出包含 `航电钉怎么注册 | 1`、不包含 fixture 正文；再传不存在路径，断言 exit code 1 且 stderr 不含本机 API key 环境值。

- [ ] **Step 2: Run the script test and verify failure**

Run: `cd apps/freshman-mvp && npx tsx --test test/freshman-guide-verify-script.test.ts`

Expected: FAIL because script is missing.

- [ ] **Step 3: Implement exact fixed question set**

脚本固定验证：

```ts
const related = [
  '学号在哪里查？',
  '航电钉怎么注册？',
  '学校钉钉怎么认证？',
  '杭电宿舍有多大？',
  '宿舍是几人间？',
  '学号查到以后怎么注册杭电钉？',
];
const unrelated = '校内哪里可以修理天文望远镜？';
```

解析 `--file` 后复用 Task 2 和 Task 3 的生产函数。任何校验失败只输出固定错误码和问题文本，不输出正文。

- [ ] **Step 4: Add the npm command and run it against the approved D-drive snapshot**

`package.json` 增加：

```json
"verify:guide": "tsx scripts/verify-freshman-guide.mts"
```

Run:

```powershell
cd apps/freshman-mvp
npm run verify:guide -- --file "D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md"
```

Expected: six related questions each return 1–3 approved links; unrelated question returns zero; command exits 0 and prints no guide正文。

- [ ] **Step 5: Run the focused test and commit**

Run: `cd apps/freshman-mvp && npx tsx --test test/freshman-guide-verify-script.test.ts`

Expected: PASS.

```powershell
git add apps/freshman-mvp/scripts/verify-freshman-guide.mts apps/freshman-mvp/test/freshman-guide-verify-script.test.ts apps/freshman-mvp/package.json
git commit -m "test: add private guide deployment verifier"
```

---

### Task 9: 完整本地回归与独立构建验收

**Files:**
- Verify only; do not edit production data.

**Interfaces:**
- Consumes all prior tasks.
- Produces a build artifact at `apps/freshman-mvp/dist/` and recorded verification output.

- [ ] **Step 1: Confirm the approved source file is outside Git**

Run:

```powershell
git check-ignore -v "D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md" 2>$null
git ls-files | Select-String 'hdu-freshman-guide-2026\.md'
```

Expected: `git ls-files` returns no path. The first command may be blank because the file is outside the repository; that is acceptable.

- [ ] **Step 2: Run all server tests**

Run: `cd apps/freshman-mvp && npm test`

Expected: exit 0, including parser/provider/router/TokenDance/E2E tests.

- [ ] **Step 3: Run all browser tests**

Run: `cd apps/freshman-mvp && npm run test:web`

Expected: exit 0, including clickable guide-source grouping.

- [ ] **Step 4: Build production client and server**

Run: `cd apps/freshman-mvp && npm run build`

Expected: exit 0; `dist/server/index.js` and `dist/client/index.html` exist.

- [ ] **Step 5: Verify the built client does not contain guide正文 or secrets**

Run:

```powershell
$dist = 'apps/freshman-mvp/dist/client'
Get-ChildItem $dist -Recurse -File | Select-String -Pattern '准考证号，即可获得学号|TOKENDANCE_API_KEY|sk-[A-Za-z0-9]+' -Quiet
```

Expected: `False`.

- [ ] **Step 6: Run the approved-guide verifier**

Run:

```powershell
cd apps/freshman-mvp
npm run verify:guide -- --file "D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md"
```

Expected: exit 0.

- [ ] **Step 7: Commit only if verification required a test-only correction**

If no correction was needed, create no empty commit. If a test fixture required correction, stage only that exact test file and use `git commit -m "test: complete guide retrieval regression coverage"`.

---

### Task 10: 备份、上传私有资料并部署到腾讯云

**Files:**
- Local source artifact: `apps/freshman-mvp/dist/`
- Private local input: `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md`
- Remote app: `/srv/live-in-hdu/apps/freshman-mvp`
- Remote private guide: `/srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md`
- Remote backups: `/srv/live-in-hdu/backups/<UTC timestamp>/`

**Interfaces:**
- systemd unit: `live-in-hdu`
- service: `127.0.0.1:3210`
- public client: `http://124.222.171.40:3210/`
- public admin shell: `http://124.222.171.40:3210/admin`
- protected endpoint: `http://124.222.171.40:3210/api/reviews`

- [ ] **Step 1: Record pre-deploy counts without modifying data**

通过现有 SSH 登录服务器后运行：

```bash
cd /srv/live-in-hdu/apps/freshman-mvp || exit 1
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DB_PATH=$(sed -n 's/^DATABASE_PATH=//p' .env.local | tail -n 1)
case "$DB_PATH" in /*) ;; *) DB_PATH="$(pwd)/${DB_PATH:-runtime/live-in-hdu.db}" ;; esac
echo "STAMP=$STAMP"
echo "DB_PATH=$DB_PATH"
sqlite3 "$DB_PATH" "select 'published=' || count(distinct intent_id) from canonical_answers where status='published';"
sqlite3 "$DB_PATH" "select 'pending=' || count(*) from review_tasks where status='pending';"
curl -fsS http://127.0.0.1:3210/api/health
```

Expected: service health succeeds and both SQL statements return numeric counts. The current checkpoint expects `published=23`; if the observed value differs, stop and reconcile whether an intentional later publication occurred before continuing. Save the printed timestamp and the observed pending count in the deployment note. Any SQLite error is a hard stop; do not migrate or recreate the database.

- [ ] **Step 2: Create a server-side rollback bundle**

Run as the existing `ubuntu` operator:

```bash
cd /srv/live-in-hdu/apps/freshman-mvp || exit 1
STAMP=${STAMP:?run Step 1 in the same shell}
BACKUP="/srv/live-in-hdu/backups/$STAMP"
install -d -m 700 "$BACKUP"
cp -a dist "$BACKUP/dist"
cp -a .env.local "$BACKUP/.env.local"
sqlite3 "$DB_PATH" ".backup '$BACKUP/live-in-hdu.db'"
if [ -f /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md ]; then
  cp -a /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md "$BACKUP/"
fi
sha256sum "$BACKUP/live-in-hdu.db" > "$BACKUP/SHA256SUMS"
find "$BACKUP/dist" -type f -print0 | sort -z | xargs -0 sha256sum >> "$BACKUP/SHA256SUMS"
echo "BACKUP=$BACKUP"
```

Expected: a private backup directory is printed; `.env.local` and DB are readable only by the operator/root through directory mode 700.

- [ ] **Step 3: Upload build and guide to temporary remote paths**

在本机 PowerShell 中执行，使用已经授权的 SSH 公钥：

```powershell
$app = 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区\.worktrees\live-in-hdu-feedback\apps\freshman-mvp'
$guide = 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md'
tar -C $app -czf "$env:TEMP\live-in-hdu-dist.tgz" dist package.json package-lock.json
scp "$env:TEMP\live-in-hdu-dist.tgz" ubuntu@124.222.171.40:/tmp/live-in-hdu-dist.tgz
scp $guide ubuntu@124.222.171.40:/tmp/hdu-freshman-guide-2026.md
```

Expected: both uploads complete without displaying or copying `.env.local`.

- [ ] **Step 4: Validate temporary files before switching**

在服务器运行：

```bash
set -euo pipefail
test -s /tmp/live-in-hdu-dist.tgz
test -s /tmp/hdu-freshman-guide-2026.md
tar -tzf /tmp/live-in-hdu-dist.tgz | grep -qx 'dist/server/index.js'
grep -q '^# 杭电新生指北' /tmp/hdu-freshman-guide-2026.md
install -d -m 700 /srv/live-in-hdu/approved-knowledge
install -m 600 /tmp/hdu-freshman-guide-2026.md /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md.new
```

Expected: exit 0. Do not restart yet.

- [ ] **Step 5: Update only the guide path key and atomically switch build**

在服务器运行：

```bash
set -euo pipefail
cd /srv/live-in-hdu/apps/freshman-mvp
test "$(pwd)" = /srv/live-in-hdu/apps/freshman-mvp
test -n "${STAMP:-}"
RELEASE="/tmp/live-in-hdu-release-$STAMP"
case "$RELEASE" in /tmp/live-in-hdu-release-*) ;; *) exit 1 ;; esac
rm -rf -- "$RELEASE"
install -d -m 700 "$RELEASE"
tar -xzf /tmp/live-in-hdu-dist.tgz -C "$RELEASE"
test -s "$RELEASE/dist/server/index.js"
test -s "$RELEASE/dist/client/index.html"
if grep -q '^FRESHMAN_GUIDE_PATH=' .env.local; then
  sed -i 's|^FRESHMAN_GUIDE_PATH=.*$|FRESHMAN_GUIDE_PATH=/srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md|' .env.local
else
  printf '\nFRESHMAN_GUIDE_PATH=/srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md\n' >> .env.local
fi
chmod 600 .env.local
mv dist "dist.previous-$STAMP"
mv "$RELEASE/dist" dist
mv /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md.new /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md
chmod 600 /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md
```

Expected: the previous build remains at `/srv/live-in-hdu/apps/freshman-mvp/dist.previous-$STAMP`; the new build and private guide are switched only after their required files pass validation.

- [ ] **Step 6: Restart and run local server acceptance**

Run:

```bash
sudo systemctl restart live-in-hdu
systemctl is-active live-in-hdu
curl -fsS http://127.0.0.1:3210/api/health
curl -fsS -X POST http://127.0.0.1:3210/api/ask -H 'content-type: application/json' --data '{"question":"航电钉怎么注册？"}'
curl -fsS -X POST http://127.0.0.1:3210/api/ask -H 'content-type: application/json' --data '{"question":"杭电宿舍有多大？"}'
```

Expected: service active; health reports `freshmanGuide.status=available`; both answers use route `knowledge` or a preset-with-guide supplement and return 1–3 approved Feishu URLs.

- [ ] **Step 7: Verify public security and UI boundaries**

Run from the local computer:

```powershell
$base = 'http://124.222.171.40:3210'
(Invoke-WebRequest "$base/").StatusCode
(Invoke-WebRequest "$base/admin").StatusCode
try { Invoke-WebRequest "$base/api/reviews" -ErrorAction Stop } catch { $_.Exception.Response.StatusCode.value__ }
```

Expected: client 200, admin page shell 200, protected review API 403.

- [ ] **Step 8: Recheck counts and perform browser acceptance**

Re-run the read-only SQL counts from Step 1 and compare exactly with the saved pre-deploy counts. In a real phone/browser test the six fixed relevant questions and one unrelated question. Confirm relevant answers show clickable Feishu links, unrelated answer has no guide link, and no real review item was changed during testing.

- [ ] **Step 9: Roll back automatically if any acceptance gate fails**

If Steps 6–8 fail, run on the server using the recorded `$BACKUP`:

```bash
set -euo pipefail
cd /srv/live-in-hdu/apps/freshman-mvp
sudo systemctl stop live-in-hdu
FAILED="dist.failed-$STAMP"
test ! -e "$FAILED"
mv dist "$FAILED"
cp -a "$BACKUP/dist" dist
cp -a "$BACKUP/.env.local" .env.local
cp -a "$BACKUP/live-in-hdu.db" "$DB_PATH"
if [ -f "$BACKUP/hdu-freshman-guide-2026.md" ]; then
  cp -a "$BACKUP/hdu-freshman-guide-2026.md" /srv/live-in-hdu/approved-knowledge/hdu-freshman-guide-2026.md
fi
sudo systemctl start live-in-hdu
systemctl is-active live-in-hdu
curl -fsS http://127.0.0.1:3210/api/health
```

Before running the rollback, verify `pwd` is exactly `/srv/live-in-hdu/apps/freshman-mvp` and `$BACKUP` begins with `/srv/live-in-hdu/backups/`. Keep `dist.failed-$STAMP` for diagnosis; do not delete it during rollback.

---

## Final Acceptance Checklist

- [ ] `npm test`, `npm run test:web`, `npm run build` and `npm run verify:guide` all exit 0.
- [ ] Approved guide Markdown is outside Git and absent from `dist/client`.
- [ ] “学号在哪里查”“航电钉怎么注册”“学校钉钉怎么认证”“杭电宿舍有多大”“宿舍是几人间”“学号查到以后怎么注册杭电钉” return guide-grounded answers.
- [ ] Preset answers remain byte-for-byte at the beginning of the response and only gain an explicit guide supplement.
- [ ] Guide-only hits return `route='knowledge'`, no unverified disclaimer, and no new review row.
- [ ] Unrelated questions continue to web search and enqueue exactly one review row.
- [ ] At most three guide links are returned; every link begins with the approved Feishu root and opens with safe `http/https` handling.
- [ ] TokenDance failure, unknown IDs and invalid JSON all fall back to deterministic guide text.
- [ ] Missing or malformed guide file degrades only guide retrieval and does not stop the service.
- [ ] Public client and admin shell return 200; public `/api/reviews` remains 403.
- [ ] Published-question count and pending-review count are unchanged before and after deployment.
- [ ] The pre-deploy published count is reconciled against the current 23-question checkpoint; no unexplained extra or missing published item is accepted.
- [ ] Rollback paths and checksums are recorded before declaring the cloud release complete.
