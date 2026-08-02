# LIVE IN HDU Feedback Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the 燃点工作室 brand, make mobile asking keyboard-safe, integrate the approved 《杭电新生指北》 into navigation and WeKnora, and make unknown answers prefer traceable HDU-specific evidence.

**Architecture:** Keep the existing Vue/Fastify/PostgreSQL/WeKnora three-stage route. Add small shared UI primitives, a shared guide catalog and source policy, a loopback search wrapper that performs HDU-first queries, and optional grounded knowledge synthesis with a deterministic fallback. Approved guide content remains a versioned D-drive snapshot imported through the existing manifest and hash-audit boundary.

**Tech Stack:** Vue 3, Vue Router, TypeScript 6, Fastify 5, Node 24, Vitest, Node test runner, WeKnora 0.7, PostgreSQL 17, SearXNG, TokenDance DeepSeek V4 Flash, PowerShell lifecycle scripts.

## Global Constraints

- Brand text is exactly `燃点工作室`; never use `橘点工作室`.
- Use the supplied 86×80 PNG unchanged and render it at no more than 40 CSS pixels until a higher-resolution asset is supplied.
- The approved guide URL is exactly `https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd`.
- Label the guide as approved community content, never as an HDU official publication.
- Keep the exact stage-three disclaimer: `该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`.
- Every question still returns an answer unless the review queue itself cannot persist the record.
- Preserve FIFO review ordering, manual publication, append-only versions, and Q11 remaining empty.
- Do not expose `/admin`, `/api/admin/*`, `/api/reviews`, or `/api/health` through the public trial gateway.
- Do not log access codes, cookies, questions, model keys, WeKnora keys, or database connection strings.
- Keep runtime data, generated guide snapshots, browser artifacts, npm cache, and test temp data under `D:\Star\LIVE_IN_HDU_RUNTIME`.
- Never stage user-owned `config/`, `vendor/`, `最新资料/`, `LIVE_IN_HDU_搭建记录.txt`, or `杭电飞书校园社区搭建方案.txt`.
- Never run `docker compose down -v`.
- A normal `npm run build` mutates `dist/client`; stop port 3210 first and restart it after that build. Public-trial-only builds must continue to avoid `dist/client`.

---

## File Structure

### New files

- `apps/freshman-mvp/web/public/brand/randian-studio-logo.png` — immutable supplied logo asset.
- `apps/freshman-mvp/web/components/BrandHeader.vue` — shared brand header.
- `apps/freshman-mvp/web/components/SourceList.vue` — source labels and safe links.
- `apps/freshman-mvp/web/components/use-visual-viewport.ts` — keyboard/viewport adapter.
- `apps/freshman-mvp/web/views/GuideView.vue` — guide directory and summaries.
- `apps/freshman-mvp/src/content/freshman-guide.ts` — shared guide sections, anchors and source resolution.
- `apps/freshman-mvp/src/providers/hdu-search-provider.ts` — HDU-first query composition, merge and ranking.
- `apps/freshman-mvp/test/hdu-search-provider.test.ts` — search policy regression tests.
- `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md` — normalized approved snapshot, not committed.
- `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json` — explicit approval manifest, not committed.

### Modified files

- `apps/freshman-mvp/web/router.ts` — add `/guide` to both private and public builds.
- `apps/freshman-mvp/web/views/QuestionDeckView.vue` — brand header and guide entry.
- `apps/freshman-mvp/web/views/ChatView.vue` — brand header and shared sources.
- `apps/freshman-mvp/web/components/QuestionCard.vue` — shared sources.
- `apps/freshman-mvp/web/components/AskSheet.vue` — visual viewport and scroll lock.
- `apps/freshman-mvp/web/components/AdminReviewQueue.vue` — typed, clickable provenance and “杭电资料不足”.
- `apps/freshman-mvp/web/views/AdminView.vue` — import provenance link.
- `apps/freshman-mvp/web/api.ts` — complete import provenance validation.
- `apps/freshman-mvp/web/styles/tokens.css` — brand, guide, source and keyboard-safe styles.
- `apps/freshman-mvp/src/providers/contracts.ts` — optional knowledge synthesis contract.
- `apps/freshman-mvp/src/providers/tokendance-provider.ts` — grounded HDU prompts.
- `apps/freshman-mvp/src/providers/weknora-provider.ts` — approved guide source resolver.
- `apps/freshman-mvp/src/services/answer-router.ts` — knowledge synthesis fallback and official source typing.
- `apps/freshman-mvp/src/server/index.ts` — wire guide resolver and HDU-first search wrapper.
- `apps/freshman-mvp/test/answer-router-v2.test.ts` — grounded knowledge and fallback tests.
- `apps/freshman-mvp/test/tokendance-provider.test.ts` — prompt boundary tests.
- `apps/freshman-mvp/test/weknora-provider.test.ts` — guide URL resolution tests.
- `apps/freshman-mvp/test/web/question-deck.test.ts` — brand, guide, sources and viewport tests.
- `apps/freshman-mvp/test/web/public-trial-router.test.ts` — public `/guide` and admin isolation tests.
- `apps/freshman-mvp/test/web/admin.test.ts` — import and review provenance tests.
- `docs/PHASE_B_KNOWLEDGE_OPERATIONS.md` — guide snapshot/update procedure.
- `docs/SESSION_CHECKPOINT_CURRENT.md` — verified post-release state only after live acceptance.

---

### Task 1: Preserve the supplied brand asset and add the shared header

**Files:**
- Create: `apps/freshman-mvp/web/public/brand/randian-studio-logo.png`
- Create: `apps/freshman-mvp/web/components/BrandHeader.vue`
- Modify: `apps/freshman-mvp/web/views/QuestionDeckView.vue`
- Modify: `apps/freshman-mvp/web/views/ChatView.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:**
- Consumes: supplied image `C:\Users\Star\AppData\Local\Temp\codex-clipboard-65bf964d-bcf5-4d07-ad93-dddb73bfd986.png`.
- Produces: `<BrandHeader subtitle="杭电新生问答与指北" />`, with `alt="燃点工作室"` and `/brand/randian-studio-logo.png`.

- [ ] **Step 1: Write the failing brand test**

Add a focused assertion after mounting the deck:

```ts
const logo = wrapper.get('img[alt="燃点工作室"]');
expect(logo.attributes('src')).toBe('/brand/randian-studio-logo.png');
expect(wrapper.get('[data-role="brand-header"]').text()).toContain('LIVE IN HDU');
expect(wrapper.get('[data-role="brand-header"]').text()).toContain('杭电新生问答与指北');
expect(wrapper.text()).not.toContain('橘点工作室');
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区\apps\freshman-mvp'
npm exec -- vitest run test/web/question-deck.test.ts
```

Expected: FAIL because the shared brand image/header does not exist.

- [ ] **Step 3: Copy the exact user asset and implement `BrandHeader`**

Copy the binary without recompression:

```powershell
New-Item -ItemType Directory -Force '.\web\public\brand' | Out-Null
Copy-Item -LiteralPath 'C:\Users\Star\AppData\Local\Temp\codex-clipboard-65bf964d-bcf5-4d07-ad93-dddb73bfd986.png' -Destination '.\web\public\brand\randian-studio-logo.png'
```

Implement the component contract:

```vue
<script setup lang="ts">
defineProps<{ subtitle: string }>();
</script>

<template>
  <header class="brand-header" data-role="brand-header">
    <img src="/brand/randian-studio-logo.png" alt="燃点工作室">
    <div>
      <strong>LIVE IN HDU</strong>
      <span>{{ subtitle }}</span>
    </div>
  </header>
</template>
```

Use it in the deck and chat headers. CSS must cap the image at `40px` by `40px`, use `object-fit: contain`, and retain text if the image fails.

- [ ] **Step 4: Run the focused web test and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```powershell
git add -- apps/freshman-mvp/web/public/brand/randian-studio-logo.png apps/freshman-mvp/web/components/BrandHeader.vue apps/freshman-mvp/web/views/QuestionDeckView.vue apps/freshman-mvp/web/views/ChatView.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/question-deck.test.ts
git commit -m "feat: add randian studio branding"
```

---

### Task 2: Add the shared guide catalog and the `/guide` experience

**Files:**
- Create: `apps/freshman-mvp/src/content/freshman-guide.ts`
- Create: `apps/freshman-mvp/web/views/GuideView.vue`
- Modify: `apps/freshman-mvp/web/router.ts`
- Modify: `apps/freshman-mvp/web/views/QuestionDeckView.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`
- Test: `apps/freshman-mvp/test/web/public-trial-router.test.ts`

**Interfaces:**
- Produces:

```ts
export interface FreshmanGuideSection {
  id: 'preparation' | 'dormitory' | 'life' | 'campus';
  title: string;
  summary: string;
  topics: readonly string[];
  href: string;
  matchTerms: readonly string[];
}

export const FRESHMAN_GUIDE_URL: string;
export const FRESHMAN_GUIDE_UPDATED_AT = '2026-07-30';
export const FRESHMAN_GUIDE_SECTIONS: readonly FreshmanGuideSection[];
export function resolveFreshmanGuideSource(title: string, content: string): SourceRef | null;
```

- [ ] **Step 1: Write failing guide and routing tests**

Add tests that assert:

```ts
await router.push('/guide');
await router.isReady();
const wrapper = mount(App, { global: { plugins: [router] } });
expect(wrapper.text()).toContain('杭电新生指北');
expect(wrapper.text()).toContain('开学准备');
expect(wrapper.text()).toContain('宿舍');
expect(wrapper.text()).toContain('社区成员整理');
expect(wrapper.findAll('a[href*="J7o6wBiJVi36wJk2VSTcyyb1nDd#"]')).toHaveLength(4);
```

The public-trial router test must assert `/guide` resolves while `/admin` remains absent.

- [ ] **Step 2: Run both files and verify RED**

```powershell
npm exec -- vitest run test/web/question-deck.test.ts test/web/public-trial-router.test.ts
```

Expected: FAIL because `/guide` and its content do not exist.

- [ ] **Step 3: Implement the four-section catalog**

Use these exact section targets:

```ts
export const FRESHMAN_GUIDE_URL =
  'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd';

export const FRESHMAN_GUIDE_SECTIONS = [
  {
    id: 'preparation',
    title: '开学准备',
    summary: '完成学号获取、智慧杭电、钉钉认证、迎新报到、缴费、到校与医保等入学准备。',
    topics: ['智慧杭电与钉钉认证', '迎新报到与缴费', '到校、户口与医保'],
    href: `${FRESHMAN_GUIDE_URL}#JDfOd4Qt1o5MirxLrh5cI4Z8nud`,
    matchTerms: ['智慧杭电', '钉钉', '报到码', '户口迁移', '大学生医保'],
  },
  {
    id: 'dormitory',
    title: '宿舍',
    summary: '了解宿舍位置、房型、环境、宽带、费用、生活规则与入住物品。',
    topics: ['宿舍位置与房型', '宽带、费用与生活规则', '入住物品'],
    href: `${FRESHMAN_GUIDE_URL}#SF3vdsZU3o6FouxCXabcyTnUnTb`,
    matchTerms: ['寝室', '宿舍', '宽带', '入住好物'],
  },
  {
    id: 'life',
    title: '生活与地图',
    summary: '快速查找校园地图、食堂、超市、快递、自习与健身信息。',
    topics: ['校园地图', '食堂、超市与快递', '自习与健身'],
    href: `${FRESHMAN_GUIDE_URL}#Hx6JdvF58ob5DJx1mgfc93sqnyg`,
    matchTerms: ['地图', '食堂', '超市', '快递', '自习', '健身'],
  },
  {
    id: 'campus',
    title: '教学区与校园设施',
    summary: '定位图书馆、教学楼、体育场和月雅湖等常用校园空间。',
    topics: ['图书馆', '教学楼', '体育场与月雅湖'],
    href: `${FRESHMAN_GUIDE_URL}#F5hHdXMamok8Eux3E84cPWn1nQg`,
    matchTerms: ['图书馆', '教学楼', '体育场', '月雅湖'],
  },
] as const;
```

`resolveFreshmanGuideSource` returns `type: 'community'`, the matching anchor URL, title `杭电新生指北 · <section>`, and `updatedAt: '2026-07-30'`; it returns `null` for other document titles.

- [ ] **Step 4: Implement `GuideView` and entry navigation**

Add the route unconditionally beside `/` and `/chat` so it is present in both normal and public-trial builds. Add a `RouterLink` with `data-action="open-guide"` to the deck. Render four cards, safe external anchors, the community disclaimer, and a return link.

- [ ] **Step 5: Run both files and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 2**

```powershell
git add -- apps/freshman-mvp/src/content/freshman-guide.ts apps/freshman-mvp/web/views/GuideView.vue apps/freshman-mvp/web/router.ts apps/freshman-mvp/web/views/QuestionDeckView.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/question-deck.test.ts apps/freshman-mvp/test/web/public-trial-router.test.ts
git commit -m "feat: integrate freshman guide navigation"
```

---

### Task 3: Unify source labels and safe clickable references

**Files:**
- Create: `apps/freshman-mvp/web/components/SourceList.vue`
- Modify: `apps/freshman-mvp/web/components/QuestionCard.vue`
- Modify: `apps/freshman-mvp/web/views/ChatView.vue`
- Modify: `apps/freshman-mvp/web/components/AdminReviewQueue.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`
- Test: `apps/freshman-mvp/test/web/admin.test.ts`

**Interfaces:**
- Consumes: `SourceRef[]` and existing `safeHttpUrl`.
- Produces: `<SourceList :sources="sources" heading="参考资料" />` and labels `杭电官方`, `新生指北`, `社区经验`, `网络线索·待核验`.

- [ ] **Step 1: Write failing source-label tests**

Use fixtures with all four source types and assert the visible labels and link safety:

```ts
expect(wrapper.text()).toContain('参考资料');
expect(wrapper.text()).toContain('杭电官方');
expect(wrapper.text()).toContain('新生指北');
expect(wrapper.text()).toContain('网络线索·待核验');
expect(wrapper.find('a[href^="javascript:"]').exists()).toBe(false);
expect(wrapper.get('a[href="https://www.hdu.edu.cn/news/example"]').attributes('target')).toBe('_blank');
```

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npm exec -- vitest run test/web/question-deck.test.ts test/web/admin.test.ts
```

Expected: FAIL because typed source labels are not rendered.

- [ ] **Step 3: Implement `SourceList` and replace duplicated lists**

The label function must be deterministic:

```ts
function label(source: SourceRef): string {
  if (source.type === 'official') return '杭电官方';
  if (source.type === 'student') return '社区经验';
  if (source.type === 'community' && source.title.includes('新生指北')) return '新生指北';
  if (source.type === 'community') return '社区经验';
  return '网络线索·待核验';
}
```

Render unsafe URLs as text only. In the admin queue, also show the hostname for safe URLs and add `data-source-type` for testing.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add -- apps/freshman-mvp/web/components/SourceList.vue apps/freshman-mvp/web/components/QuestionCard.vue apps/freshman-mvp/web/views/ChatView.vue apps/freshman-mvp/web/components/AdminReviewQueue.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/question-deck.test.ts apps/freshman-mvp/test/web/admin.test.ts
git commit -m "feat: show typed answer references"
```

---

### Task 4: Make the ask sheet follow the mobile visual viewport

**Files:**
- Create: `apps/freshman-mvp/web/components/use-visual-viewport.ts`
- Modify: `apps/freshman-mvp/web/components/AskSheet.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:**
- Produces:

```ts
export interface ViewportMetrics { height: number; offsetTop: number }
export function readViewportMetrics(windowValue: Window): ViewportMetrics;
export function useVisualViewport(panel: Ref<HTMLElement | null>): {
  viewportStyle: ComputedRef<Record<string, string>>;
  revealInput(element: HTMLElement): void;
};
```

- [ ] **Step 1: Write the failing viewport test**

Stub `window.visualViewport` with `height: 420`, `offsetTop: 140`, and event listeners. Open the ask sheet, dispatch `resize`, and assert:

```ts
const backdrop = wrapper.get('.modal-backdrop');
expect(backdrop.attributes('style')).toContain('--visual-viewport-height: 420px');
expect(backdrop.attributes('style')).toContain('--visual-viewport-offset-top: 140px');
expect(wrapper.get('[data-action="submit-question"]').exists()).toBe(true);
```

Add a second test with no `visualViewport` and assert a nonzero `window.innerHeight` fallback. Preserve the existing Escape and focus-loop assertions.

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npm exec -- vitest run test/web/question-deck.test.ts
```

Expected: FAIL because the viewport variables and submit marker do not exist.

- [ ] **Step 3: Implement the composable and panel behavior**

Requirements:

```ts
const height = windowValue.visualViewport?.height ?? windowValue.innerHeight;
const offsetTop = windowValue.visualViewport?.offsetTop ?? 0;
```

Subscribe to `resize` and `scroll`, unsubscribe on unmount, lock body scroll while the sheet is open, and restore the previous body style and scroll position on close. `revealInput` must call `scrollIntoView({ block: 'nearest' })` in a short timeout after focus.

Set `data-action="submit-question"` on the send button. CSS must use `height: var(--visual-viewport-height, 100dvh)`, position the backdrop at the computed top offset, keep the form scrollable, and make the submit button sticky at the bottom of the sheet. Do not use a fixed keyboard pixel value.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the command from Step 2. Expected: PASS, including existing accessibility tests.

- [ ] **Step 5: Commit Task 4**

```powershell
git add -- apps/freshman-mvp/web/components/use-visual-viewport.ts apps/freshman-mvp/web/components/AskSheet.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/question-deck.test.ts
git commit -m "fix: keep asking controls above mobile keyboards"
```

---

### Task 5: Add HDU-first search and official source classification

**Files:**
- Create: `apps/freshman-mvp/src/providers/hdu-search-provider.ts`
- Modify: `apps/freshman-mvp/src/services/answer-router.ts`
- Modify: `apps/freshman-mvp/src/server/index.ts`
- Test: `apps/freshman-mvp/test/hdu-search-provider.test.ts`
- Test: `apps/freshman-mvp/test/answer-router-v2.test.ts`

**Interfaces:**
- Consumes: an existing `SearchProvider`.
- Produces:

```ts
export function isHduOfficialUrl(url: string): boolean;
export function sourceFromSearchLead(lead: SearchLead): SourceRef;
export class HduFirstSearchProvider implements SearchProvider {
  constructor(inner: SearchProvider, maxResults?: number);
  search(question: string): Promise<WebSearchResult>;
}
```

- [ ] **Step 1: Write failing provider tests**

Test exact query order and merged ranking:

```ts
assert.deepEqual(receivedQueries, [
  'site:hdu.edu.cn 社团有什么作用吗',
  '杭州电子科技大学 社团有什么作用吗',
]);
assert.deepEqual(result.leads.map((item) => item.title), [
  '杭电学生社团科技文化节',
  '社区社团经验',
  '其他高校社团介绍',
]);
assert.equal(isHduOfficialUrl('https://www.hdu.edu.cn/news/a'), true);
assert.equal(isHduOfficialUrl('https://evil-hdu.edu.cn/a'), false);
```

Also test one failed query plus one successful query, URL deduplication, six-result cap, and total failure status.

- [ ] **Step 2: Run provider tests and verify RED**

```powershell
npm exec -- tsx --test test/hdu-search-provider.test.ts test/answer-router-v2.test.ts
```

Expected: FAIL because the wrapper and official classification do not exist.

- [ ] **Step 3: Implement the wrapper and source policy**

Run the official query first, then the HDU-context query. Merge safe leads by URL. Rank host `hdu.edu.cn` or `*.hdu.edu.cn` first, the approved guide host second, and all other public hosts last while preserving order within each tier. Return `available` if either inner call is available; otherwise retain an explicit unavailable status.

Update `searchSources` in `answer-router.ts` to call `sourceFromSearchLead`, so official results use `type: 'official'` and all other open-web results use `type: 'web'`.

- [ ] **Step 4: Wire the wrapper in production composition**

In `src/server/index.ts`, wrap the configured `SearxngProvider` exactly once:

```ts
const publicSearch = new SearxngProvider({ /* existing options */ });
const search = new HduFirstSearchProvider(publicSearch, config.searchMaxResults);
```

Keep health reporting tied to the underlying SearXNG provider so status fields remain accurate.

- [ ] **Step 5: Run provider and router tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```powershell
git add -- apps/freshman-mvp/src/providers/hdu-search-provider.ts apps/freshman-mvp/src/services/answer-router.ts apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/test/hdu-search-provider.test.ts apps/freshman-mvp/test/answer-router-v2.test.ts
git commit -m "feat: prioritize hdu evidence in web search"
```

---

### Task 6: Ground knowledge answers in HDU evidence without blocking fallbacks

**Files:**
- Modify: `apps/freshman-mvp/src/providers/contracts.ts`
- Modify: `apps/freshman-mvp/src/providers/tokendance-provider.ts`
- Modify: `apps/freshman-mvp/src/providers/weknora-provider.ts`
- Modify: `apps/freshman-mvp/src/services/answer-router.ts`
- Modify: `apps/freshman-mvp/src/server/index.ts`
- Test: `apps/freshman-mvp/test/tokendance-provider.test.ts`
- Test: `apps/freshman-mvp/test/weknora-provider.test.ts`
- Test: `apps/freshman-mvp/test/answer-router-v2.test.ts`

**Interfaces:**
- Add:

```ts
export interface KnowledgeSynthesisInput {
  question: string;
  hits: KnowledgeHit[];
}

export interface ModelProvider {
  classifyIntent(
    question: string,
    intents: QuestionIntent[],
  ): Promise<IntentClassification | null>;
  synthesize(input: SynthesisInput): Promise<ModelAnswer>;
  synthesizeKnowledge?(input: KnowledgeSynthesisInput): Promise<ModelAnswer>;
}
```

- `WeKnoraProviderOptions` gains `sourceResolver?: (hit: Pick<KnowledgeHit, 'title' | 'content'>) => SourceRef | null`.

- [ ] **Step 1: Write failing grounded-answer tests**

Add a router test where knowledge returns a guide hit and model returns a concise HDU answer. Assert search is never called, the answer is the synthesized text, and sources are taken from the hit rather than any model-invented source.

Add a second test where `synthesizeKnowledge` throws. Assert the route is still `knowledge`, the exact hit text is returned, and its source remains present.

Add a TokenDance request-body test asserting the prompt contains all of:

```text
杭州电子科技大学
不得把其他学校的普遍情况写成杭电事实
只能依据输入知识片段
通用建议必须单独标注
```

- [ ] **Step 2: Run three focused files and verify RED**

```powershell
npm exec -- tsx --test test/tokendance-provider.test.ts test/weknora-provider.test.ts test/answer-router-v2.test.ts
```

Expected: FAIL because the knowledge synthesis contract and guide resolver do not exist.

- [ ] **Step 3: Implement `synthesizeKnowledge`**

Pass only `question` and normalized hit fields (`content`, `title`, `source`) to TokenDance. Instruct the model to lead with the direct answer, separate HDU evidence from generic advice, preserve uncertainty, and never create URLs. Return text only; the router owns the source list.

- [ ] **Step 4: Add guide source resolution to WeKnora**

Call `resolveFreshmanGuideSource` from the shared catalog through the new resolver option. For non-guide documents preserve the current source behavior. A guide hit must resolve to a `community` source with the section anchor and `updatedAt: '2026-07-30'`.

- [ ] **Step 5: Update router knowledge handling**

Deduplicate hit sources first. If `synthesizeKnowledge` exists, call it and accept only `isUsableAnswer(text)`. On absence, error, or unusable text, return the current deterministic concatenation of nonblank hit content. Never call web search after a usable knowledge hit, even if model synthesis fails.

- [ ] **Step 6: Strengthen third-stage TokenDance wording**

Keep the existing safe constraints and add the HDU/generic distinction. Do not change the disclaimer or let the model control the returned source array.

- [ ] **Step 7: Run three focused files and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 8: Commit Task 6**

```powershell
git add -- apps/freshman-mvp/src/providers/contracts.ts apps/freshman-mvp/src/providers/tokendance-provider.ts apps/freshman-mvp/src/providers/weknora-provider.ts apps/freshman-mvp/src/services/answer-router.ts apps/freshman-mvp/src/server/index.ts apps/freshman-mvp/test/tokendance-provider.test.ts apps/freshman-mvp/test/weknora-provider.test.ts apps/freshman-mvp/test/answer-router-v2.test.ts
git commit -m "feat: ground knowledge answers in hdu sources"
```

---

### Task 7: Create, validate and import the approved guide snapshot

**Files:**
- Create outside Git: `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md`
- Create outside Git: `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json`
- Modify: `docs/PHASE_B_KNOWLEDGE_OPERATIONS.md`
- Test: `apps/freshman-mvp/test/knowledge-import-cli.test.ts`
- Test: `apps/freshman-mvp/test/knowledge-import.test.ts`

**Interfaces:**
- Consumes: the user-approved Feishu page and the existing import CLI.
- Produces: one completed WeKnora document record with title `杭电新生指北` and a PostgreSQL audit record.

- [ ] **Step 1: Add an approval-contract characterization test**

Add a manifest validation fixture with the exact approved metadata:

```ts
{
  path: 'hdu-freshman-guide-2026.md',
  title: '杭电新生指北',
  sourceType: 'community',
  sourceUrl: 'https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd',
  publishedAt: '2026-07-30',
  applicableYear: 2026,
  approvedBy: 'project-owner',
  approvedAt: '2026-08-02T00:15:00+08:00',
  ingestMode: 'manual'
}
```

Assert the normalized item keeps the source URL, year, approval timestamp and manual mode.

- [ ] **Step 2: Run the import tests and verify the existing contract**

```powershell
npm exec -- tsx --test test/knowledge-import-cli.test.ts test/knowledge-import.test.ts
```

Expected: PASS because the existing manifest contract should already preserve every field. If it fails, stop the live import and fix only the demonstrated metadata loss before continuing.

- [ ] **Step 3: Export and normalize the approved Feishu content**

Use the logged-in browser to read the current page from top to bottom. Create the D-drive Markdown snapshot with this exact front section:

```markdown
# 杭电新生指北

- 资料类型：燃点工作室与社区成员整理
- 适用年份：2026
- 原始来源：https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd
- 页面最近修改：2026-07-30
- 人工批准：project-owner，2026-08-02

> 本资料不是杭州电子科技大学官方文件；政策与时间安排以校方最新通知为准。
```

Retain the guide content under the four catalog headings. Remove Feishu navigation, view counts, comments, uploader logs, editor contact details and UI labels. Do not invent text for collapsed or unloaded sections; scroll and verify each section before including it.

- [ ] **Step 4: Write the explicit manifest outside Git**

The manifest body is:

```json
{
  "version": 1,
  "items": [
    {
      "path": "hdu-freshman-guide-2026.md",
      "title": "杭电新生指北",
      "sourceType": "community",
      "sourceUrl": "https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd",
      "publishedAt": "2026-07-30",
      "applicableYear": 2026,
      "approvedBy": "project-owner",
      "approvedAt": "2026-08-02T00:15:00+08:00",
      "ingestMode": "manual"
    }
  ]
}
```

- [ ] **Step 5: Dry-run validation before network mutation**

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区\apps\freshman-mvp'
npm exec -- tsx scripts/import-approved-knowledge.mts --manifest 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json' --approved-root 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge' --dry-run
```

Expected: `valid: true`, `itemCount: 1`, the exact title and a 64-character SHA-256.

- [ ] **Step 6: Import and wait for WeKnora parsing**

```powershell
npm exec -- tsx scripts/import-approved-knowledge.mts --manifest 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json' --approved-root 'D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge' --wait --timeout-minutes 30
```

Expected: `created: 1`, `completed: 1`, `failed: 0`. A second identical run must report `created: 0`, `skipped: 1`.

- [ ] **Step 7: Document the update procedure and commit only tracked docs/tests**

Document the snapshot, diff, reapproval, dry-run, import, idempotency and backup steps. Explicitly state that the D-drive snapshot and manifest are not committed.

```powershell
git add -- apps/freshman-mvp/test/knowledge-import-cli.test.ts apps/freshman-mvp/test/knowledge-import.test.ts docs/PHASE_B_KNOWLEDGE_OPERATIONS.md
git commit -m "docs: define approved guide import workflow"
```

---

### Task 8: Expose provenance and “杭电资料不足” in local operations

**Files:**
- Modify: `apps/freshman-mvp/web/api.ts`
- Modify: `apps/freshman-mvp/web/views/AdminView.vue`
- Modify: `apps/freshman-mvp/web/components/AdminReviewQueue.vue`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/admin.test.ts`

**Interfaces:**
- `KnowledgeImportStatus` additionally validates `sourceType`, `sourceUrl`, `publishedAt`, `ingestMode`, `knowledgeBaseId`, `createdAt`.
- A review is labeled `杭电资料不足` when it has no `official` source and no `community` source whose title includes `新生指北`.

- [ ] **Step 1: Write failing admin tests**

Assert the guide import renders a safe clickable Feishu source URL, source type `community`, SHA prefix, approval time and parse state. For a generic review with no HDU/guide evidence, assert `杭电资料不足`; for a review with an official source, assert the label is absent.

- [ ] **Step 2: Run admin tests and verify RED**

```powershell
npm exec -- vitest run test/web/admin.test.ts
```

Expected: FAIL because source URL and evidence-gap state are not exposed.

- [ ] **Step 3: Complete API validation and render provenance**

Extend `KnowledgeImportStatus` and `isKnowledgeImportStatus` with the fields above. Render `sourceUrl` only through `safeHttpUrl`; unsafe values remain text. Keep the management page local-only.

Implement the evidence-gap predicate as a pure function in `AdminReviewQueue.vue` or a nearby focused module:

```ts
function lacksHduEvidence(review: ReviewTask): boolean {
  return !review.sources.some((source) => (
    source.type === 'official'
    || (source.type === 'community' && source.title.includes('新生指北'))
  ));
}
```

- [ ] **Step 4: Run admin tests and verify GREEN**

Run the command from Step 2. Expected: PASS.

- [ ] **Step 5: Commit Task 8**

```powershell
git add -- apps/freshman-mvp/web/api.ts apps/freshman-mvp/web/views/AdminView.vue apps/freshman-mvp/web/components/AdminReviewQueue.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/admin.test.ts
git commit -m "feat: surface answer provenance gaps"
```

---

### Task 9: Verify the two reported questions with real local services

**Files:**
- Modify only if failures reveal a defect in Tasks 5–8; use a new failing test before each correction.
- Runtime artifacts: `D:\Star\LIVE_IN_HDU_RUNTIME\public-trial\logs` and PostgreSQL review records.

**Interfaces:**
- Consumes: live PostgreSQL, WeKnora, SearXNG and TokenDance.
- Produces: evidence that both questions return HDU-specific text plus traceable sources, while preserving review FIFO behavior.

- [ ] **Step 1: Verify stack health without model/search mutation**

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
.\scripts\test-knowledge-stack.ps1
Invoke-RestMethod 'http://127.0.0.1:3210/api/health' | ConvertTo-Json -Depth 8
```

Expected: gateway and PostgreSQL healthy, WeKnora available, SearXNG configured, TokenDance configured.

- [ ] **Step 2: Submit the two exact regression questions with unique request IDs**

```powershell
$questions = @('给个社团的建议', '社团有什么作用吗')
foreach ($question in $questions) {
  $body = @{ question = $question; requestId = "feedback-$([guid]::NewGuid())" } | ConvertTo-Json
  Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:3210/api/ask' -ContentType 'application/json' -Body $body | ConvertTo-Json -Depth 8
}
```

Expected for each response:

- nonblank answer;
- at least one source URL;
- at least one `official` or approved guide `community` source;
- answer mentions 杭电 or 杭州电子科技大学;
- no “广泛高校通常” framing presented as HDU fact;
- if route is `web`, exact disclaimer and a new FIFO ordinal.

- [ ] **Step 3: Verify review records remain ordered and source-complete**

```powershell
Invoke-RestMethod 'http://127.0.0.1:3210/api/reviews?status=pending' | ConvertTo-Json -Depth 10
```

Expected: ascending server ordinals, exact questions, source arrays retained, no secret values.

- [ ] **Step 4: Convert any observed defect into RED/GREEN tests**

If an expectation fails, add the smallest failing unit or integration test to the owning Task 5–8 test file, verify RED, implement the minimal correction, verify GREEN, and commit with message `fix: keep hdu answers evidence grounded`.

---

### Task 10: Full verification, safe rebuild, browser acceptance and checkpoint

**Files:**
- Modify: `docs/SESSION_CHECKPOINT_CURRENT.md`
- Do not modify or stage protected user files.

**Interfaces:**
- Produces: verified private UI, public trial UI, isolated admin boundary, current commit history and resumable operations state.

- [ ] **Step 1: Run all automated tests before rebuilding**

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区\apps\freshman-mvp'
npm run test:all
```

Expected: zero failures; only the existing explicitly opt-in live environment tests may skip.

- [ ] **Step 2: Stop the private gateway before the normal build**

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
.\scripts\stop-freshman-platform.ps1
```

Verify port 3210 has no listener. Do not stop or delete PostgreSQL/WeKnora volumes.

- [ ] **Step 3: Build normal and public-trial artifacts**

```powershell
Set-Location '.\apps\freshman-mvp'
npm run build
npm run build:trial
Set-Location '..\..'
```

Expected: both builds exit 0; public-trial assertion succeeds.

- [ ] **Step 4: Restart the private platform and verify hashed assets**

```powershell
.\scripts\start-freshman-platform.ps1
$root = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:3210/'
$asset = [regex]::Match($root.Content, 'src="([^"]+\.js)"').Groups[1].Value
Invoke-WebRequest -UseBasicParsing ("http://127.0.0.1:3210" + $asset) | Select-Object StatusCode, RawContentLength
```

Expected: root 200 and referenced JS 200 with nonzero length.

- [ ] **Step 5: Verify real browser pages**

Use the real browser at 375×667 and 390×844 for:

- `/` — logo, brand, guide entry and question deck;
- `/guide` — four guide cards and external anchors;
- ask sheet — simulated visual viewport shrink keeps textarea and send button visible;
- `/chat` — typed source labels and clickable links;
- `/admin` — guide provenance and evidence-gap labels.

Capture screenshots under `D:\Star\LIVE_IN_HDU_RUNTIME\acceptance\2026-08-02-feedback-optimization`.

- [ ] **Step 6: Verify the public trial and admin isolation**

```powershell
.\scripts\test-public-trial.ps1 -UseSavedPublicUrl
```

Expected: unauthenticated root 302; authenticated root, guide, questions and ask paths succeed; admin and health paths remain 404. If the script does not yet check `/guide`, add a RED test and update the script before claiming acceptance.

- [ ] **Step 7: Record the mobile-device boundary honestly**

If both an iPhone and Android device are available, test inside WeChat: open ask sheet, type multiple lines, hide/show keyboard, scroll and submit. If either device is unavailable, record `微信键盘实机验收待完成` in the checkpoint rather than claiming full compatibility.

- [ ] **Step 8: Update the checkpoint from observed results**

Record exact test counts, build status, guide import version/hash, current public URL, review queue count, screenshot directory and device-test status. Do not copy secrets or connection strings.

- [ ] **Step 9: Run final repository checks and commit the checkpoint**

```powershell
git diff --check
git status --short
git add -- docs/SESSION_CHECKPOINT_CURRENT.md
git commit -m "docs: checkpoint feedback optimization release"
```

Expected: only intended tracked files are committed; protected untracked paths remain untouched.
