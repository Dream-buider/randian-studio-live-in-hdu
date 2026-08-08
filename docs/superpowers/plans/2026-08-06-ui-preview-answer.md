# UI Preview Answer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the freshman UI preview complete the free-question flow with an explicitly simulated local answer while preserving the real production API path.

**Architecture:** Add one dynamically imported mock-answer factory under `web/mock/`. Extend `askQuestion()` with the same narrow dependency-injection pattern already used by question loading so tests can prove that preview mode never reaches the network and production still does.

**Tech Stack:** Vue 3, TypeScript, Vite modes, Vitest.

## Global Constraints

- Only `ui-preview` may use local simulated answer data.
- Production and public-trial builds must not contain preview data.
- Every simulated answer must visibly identify itself as UI preview content.
- Existing session, retry, safety, and official API behavior remain unchanged.
- Do not stage, commit, or push changes.

---

### Task 1: Preview answer boundary

**Files:**
- Create: `apps/freshman-mvp/web/mock/answers.ts`
- Modify: `apps/freshman-mvp/web/api.ts`
- Test: `apps/freshman-mvp/test/web/ui-preview.test.ts`

**Interfaces:**
- Produces: `createUiPreviewAnswer(question: string, context?: QuestionContext): AnswerResult`
- Extends: `askQuestion(question, context?, requestId?, options?: AskQuestionOptions): Promise<AnswerResult>`
- `AskQuestionOptions` provides `mode?: string` and `fetcher?: typeof fetch` without changing existing callers.

- [ ] **Step 1: Write the failing test**

Add a test that calls `askQuestion()` with `{ mode: 'ui-preview', fetcher: throwingFetcher }` and asserts:

```ts
expect(result.route).toBe('knowledge');
expect(result.answer).toContain('UI 测试版');
expect(result.answer).toContain('宿舍晚上几点熄灯？');
expect(result.sources[0]?.title).toContain('模拟回答');
```

The throwing fetcher makes any accidental network request fail the test through real behavior.

- [ ] **Step 2: Run the test to verify RED**

Run:

```bash
npm.cmd exec -- vitest run test/web/ui-preview.test.ts
```

Expected: FAIL because `askQuestion()` still calls `/api/ask` and the throwing fetcher is not yet supported.

- [ ] **Step 3: Implement the minimal preview branch**

Create `web/mock/answers.ts` with a factory returning a `knowledge` result whose answer and source title explicitly say the result is simulated. In `api.ts`, resolve `mode` from `options.mode ?? import.meta.env.MODE`; dynamically import the factory only for `ui-preview`, otherwise use `options.fetcher ?? fetch` for the existing request.

- [ ] **Step 4: Run the targeted test to verify GREEN**

Run:

```bash
npm.cmd exec -- vitest run test/web/ui-preview.test.ts
```

Expected: 5 tests pass.

### Task 2: Regression and browser verification

**Files:**
- Verify only; no additional production files expected.

**Interfaces:**
- Consumes: the unchanged question-deck session flow and the new preview `askQuestion()` branch.

- [ ] **Step 1: Run full frontend tests**

```bash
npm.cmd run test:web
```

Expected: all test files pass with zero failures.

- [ ] **Step 2: Build production and public-trial artifacts**

```bash
npm.cmd run build
npm.cmd run build:trial
```

Expected: both exit zero; preview-data assertions pass.

- [ ] **Step 3: Verify the browser flow**

Open `http://127.0.0.1:5173/questions`, submit `宿舍晚上几点熄灯？`, and confirm the chat screen contains `UI 测试版` plus the submitted question, with no console errors.

- [ ] **Step 4: Record evidence without committing**

Update the task plan statuses and report exact files, commands, results, test URL, and any remaining server-environment failures. Do not run `git add`, `git commit`, or `git push`.
