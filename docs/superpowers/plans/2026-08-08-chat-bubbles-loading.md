# `/chat` Chat Bubbles and Loading State Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the submitted user question visible as a right-side chat bubble and render every AI state on the left with an animated three-dot waiting indicator.

**Architecture:** Keep the existing single-request `ChatSessionRequest` and `/api/ask` flow unchanged. Restructure only `ChatView.vue` so `pending.question` becomes the user message and the current loading/result/error branches become assistant messages, then add scoped dawn-theme styles and keyframes in `tokens.css`.

**Tech Stack:** Vue 3 `<script setup>`, Vue Router, TypeScript, Vitest, Vue Test Utils, CSS animations, Playwright/Edge browser QA.

## Global Constraints

- Do not modify the API contract, answer contents, cloud deployment, admin interface, or multi-turn context behavior.
- Remove the existing “参考问题” card and do not render `context.question` or its category on `/chat`.
- Render the exact submitted `pending.question` on the right.
- Keep AI loading, success, failure, and retry states on the left.
- Preserve trust status, answer body, disclaimer, sources, duplicate-submit protection, and real backend behavior.
- The waiting state must show “正在整理回复” plus three animated dots and a subtle glow.
- Do not add special handling for the operating system's reduced-motion preference.

---

### Task 1: Protect the chat-message behavior with failing component tests

**Files:**
- Modify: `apps/freshman-mvp/test/web/question-deck.test.ts:447-523`
- Modify: `apps/freshman-mvp/test/web/question-deck.test.ts:635-677`

**Interfaces:**
- Consumes: `ChatSessionRequest.question: string`, the existing `/chat` route, and the deferred `/api/ask` test response.
- Produces: DOM contracts `data-role="chat-thread"`, `data-role="user-message"`, `data-role="assistant-thinking"`, and three `data-role="thinking-dot"` elements.

- [ ] **Step 1: Add the failing assertions for the submitted question and removed reference card**

In the existing test that submits `宿舍晚上几点熄灯？`, replace the expectations for the reference card with:

```ts
const userMessage = wrapper.get('[data-role="user-message"]');
expect(userMessage.text()).toContain('宿舍晚上几点熄灯？');
expect(wrapper.text()).not.toContain('参考问题');
expect(wrapper.text()).not.toContain('第 4 个新生问题是什么？');
expect(wrapper.get('[data-role="answer-stage"]').text())
  .toContain('社区资料建议以当年宿管通知为准。');
```

- [ ] **Step 2: Add the failing loading-state assertions**

In `shows chat loading and retries a malformed answer envelope without leaking it`, assert the waiting DOM before resolving the response:

```ts
expect(wrapper.get('[data-role="user-message"]').text()).toContain('一个未命中的问题');
const thinking = wrapper.get('[data-role="assistant-thinking"]');
expect(thinking.attributes('role')).toBe('status');
expect(thinking.attributes('aria-label')).toBe('AI 正在整理回复');
expect(thinking.text()).toContain('正在整理回复');
expect(thinking.findAll('[data-role="thinking-dot"]')).toHaveLength(3);
```

After resolving the successful retry, add:

```ts
expect(wrapper.find('[data-role="assistant-thinking"]').exists()).toBe(false);
expect(wrapper.get('[data-role="answer-stage"]').text()).toContain('已审核的补充回答。');
```

- [ ] **Step 3: Run the focused test and verify RED**

Run from `apps/freshman-mvp`:

```powershell
npm run test:web -- test/web/question-deck.test.ts
```

Expected: FAIL because `[data-role="user-message"]` and `[data-role="assistant-thinking"]` do not exist and the old “参考问题” card is still rendered.

---

### Task 2: Restructure `/chat` into user and assistant message rows

**Files:**
- Modify: `apps/freshman-mvp/web/views/ChatView.vue:1-149`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:**
- Consumes: `pending: Ref<ChatSessionRequest | null>`, `loading`, `failed`, `requiresExplicitRetry`, and `result`.
- Produces: the DOM roles defined in Task 1 while preserving all existing buttons and answer components.

- [ ] **Step 1: Remove the unused reference-context computation**

Change the Vue import to remove `computed`, delete:

```ts
const context = computed(() => pending.value?.context ?? null);
```

Keep the stored `pending.context` data unchanged because the API request still uses it.

- [ ] **Step 2: Replace the reference card and top-level state branches with a chat thread**

Use this structure below the page header:

```vue
<section v-if="pending" class="chat-thread" data-role="chat-thread">
  <article class="chat-message chat-message-user" data-role="user-message" aria-label="你的问题">
    <p>{{ pending.question }}</p>
  </article>

  <div
    v-if="loading"
    class="chat-message chat-message-assistant thinking-message"
    data-role="assistant-thinking"
    role="status"
    aria-label="AI 正在整理回复"
  >
    <span>正在整理回复</span>
    <span class="thinking-dots" aria-hidden="true">
      <i data-role="thinking-dot"></i>
      <i data-role="thinking-dot"></i>
      <i data-role="thinking-dot"></i>
    </span>
  </div>

  <section v-else-if="requiresExplicitRetry" class="state-card chat-message-assistant" role="alert">
    <h1>上一次请求可能仍在处理中</h1>
    <p>为避免重复提交，页面不会自动再次发送；如需继续，请明确重试。</p>
    <button type="button" data-action="retry-answer" @click="loadAnswer">明确重试</button>
  </section>
  <section v-else-if="failed" class="state-card chat-message-assistant" role="alert">
    <h1>回答暂时加载失败</h1>
    <p>没有显示不完整的结果，请稍后重新尝试。</p>
    <button type="button" data-action="retry-answer" @click="loadAnswer">重新获取回答</button>
  </section>
  <section
    v-else-if="result"
    class="answer-card chat-message-assistant"
    data-role="answer-stage"
    aria-live="polite"
  >
    <SourceBadge :status="result.trustStatus" />
    <p>{{ result.answer }}</p>
    <p v-if="result.route === 'web'" class="disclaimer">{{ result.disclaimer }}</p>
    <SourceList :sources="result.sources" heading="参考资料" />
  </section>
</section>
<section v-else class="empty-chat">
  <h1>还没有待发送的问题</h1>
  <p>返回问题卡后，可以带着当前内容继续提问。</p>
</section>
```

When applying the plan, copy the existing state-card and answer-card child content verbatim into the indicated branches; the comments above describe placement and are not production markup.

- [ ] **Step 3: Run the focused test and verify the behavioral assertions pass**

Run:

```powershell
npm run test:web -- test/web/question-deck.test.ts
```

Expected: the submitted-question and waiting-state assertions PASS. Any remaining failure must be unrelated to the removed reference-card expectations and must be resolved before styling.

---

### Task 3: Style the right user bubble, left AI surfaces, and animated waiting state

**Files:**
- Modify: `apps/freshman-mvp/web/styles/tokens.css:1006-1173`
- Modify: `apps/freshman-mvp/web/styles/tokens.css:1985-2000`
- Test: `apps/freshman-mvp/test/web/question-deck.test.ts`

**Interfaces:**
- Consumes: `.chat-thread`, `.chat-message-user`, `.chat-message-assistant`, `.thinking-message`, `.thinking-dots`, and `[data-role="thinking-dot"]` from Task 2.
- Produces: right-aligned user bubble, left-aligned AI states, and visible repeating `chat-thinking-dot`/`chat-thinking-glow` animations.

- [ ] **Step 1: Add the chat layout and user/assistant alignment rules**

Add these dawn-theme scoped rules:

```css
.chat-page[data-theme="randian-dawn"] .chat-thread {
  display: grid;
  gap: 16px;
  align-items: start;
}

.chat-page[data-theme="randian-dawn"] .chat-message-user {
  justify-self: end;
  max-width: min(82%, 520px);
  padding: 13px 16px;
  border-radius: 20px 20px 6px 20px;
  color: #fffaf2;
  background: var(--student-action);
  box-shadow: 0 14px 30px -22px rgb(151 67 41 / 76%);
}

.chat-page[data-theme="randian-dawn"] .chat-message-user p {
  margin: 0;
  line-height: 1.65;
  white-space: pre-wrap;
}

.chat-page[data-theme="randian-dawn"] .chat-message-assistant {
  width: min(92%, 620px);
  justify-self: start;
}
```

- [ ] **Step 2: Add the thinking bubble and repeating animations**

Add:

```css
.chat-page[data-theme="randian-dawn"] .thinking-message {
  display: inline-flex;
  width: auto;
  align-items: center;
  gap: 10px;
  padding: 13px 16px;
  border: 1px solid var(--student-line);
  border-radius: 20px 20px 20px 6px;
  color: var(--student-muted);
  background: var(--student-surface);
  animation: chat-thinking-glow 1.8s ease-in-out infinite;
}

.thinking-dots {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.thinking-dots i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--student-action);
  animation: chat-thinking-dot 1.1s ease-in-out infinite;
}

.thinking-dots i:nth-child(2) { animation-delay: 0.16s; }
.thinking-dots i:nth-child(3) { animation-delay: 0.32s; }

@keyframes chat-thinking-dot {
  0%, 70%, 100% { opacity: 0.28; transform: translateY(0); }
  35% { opacity: 1; transform: translateY(-3px); }
}

@keyframes chat-thinking-glow {
  0%, 100% { box-shadow: 0 10px 26px -24px rgb(214 84 61 / 30%); }
  50% { box-shadow: 0 12px 30px -16px rgb(240 162 58 / 48%); }
}
```

Do not add these selectors to the existing `prefers-reduced-motion` override.

- [ ] **Step 3: Run the full frontend suite**

Run:

```powershell
npm run test:web
```

Expected: all frontend test files PASS with zero failures.

- [ ] **Step 4: Run the production build**

Run:

```powershell
npm run build
```

Expected: Vue type checking, server TypeScript compilation, Vite build, and the no-preview-data assertion all exit successfully.

---

### Task 4: Verify the real browser flow and commit the implementation

**Files:**
- Verify: `apps/freshman-mvp/web/views/ChatView.vue`
- Verify: `apps/freshman-mvp/web/styles/tokens.css`
- Verify: `apps/freshman-mvp/test/web/question-deck.test.ts`
- Create screenshot: `output/playwright/chat-bubbles-loading.png` only if a useful final artifact is needed; do not stage it.

**Interfaces:**
- Consumes: the running Vite frontend at `http://127.0.0.1:5174` and real API proxy at `http://127.0.0.1:3210`.
- Produces: visual evidence that the real submitted question and AI state appear in the correct columns at a mobile viewport.

- [ ] **Step 1: Open the real page at a mobile viewport**

Use the available Playwright/Edge runtime to open `http://127.0.0.1:5174/questions` at approximately `446 × 956`, submit `宿舍晚上几点熄灯`, and observe navigation to `/chat`.

- [ ] **Step 2: Verify the loading state before the answer resolves when observable**

Confirm that the user message is on the right, the waiting bubble is on the left, the three dots animate, and no “参考问题” text or card appears. If the real API resolves too quickly to inspect, use the existing deferred Vitest case as loading-state evidence and do not add artificial production delays.

- [ ] **Step 3: Verify the completed answer**

Confirm that the user question remains visible, the waiting bubble disappears, the AI answer is left-aligned, sources/trust labels remain usable, and browser console/page errors are zero.

- [ ] **Step 4: Run final repository checks**

From `apps/freshman-mvp`, run:

```powershell
npm run test:all
npm run build
```

Then from the worktree root run:

```powershell
git diff --check
git status --short
```

Expected: all tests and builds pass, `git diff --check` is silent, and only the intended source/test/plan files are changed.

- [ ] **Step 5: Commit the implementation**

```powershell
git add -- apps/freshman-mvp/web/views/ChatView.vue apps/freshman-mvp/web/styles/tokens.css apps/freshman-mvp/test/web/question-deck.test.ts docs/superpowers/plans/2026-08-08-chat-bubbles-loading.md
git commit -m "feat: refine chat question and loading UI"
```
