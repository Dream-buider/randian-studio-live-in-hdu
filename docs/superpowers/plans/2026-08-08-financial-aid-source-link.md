# Financial Aid Source Link Correction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Publish a new `financial-aid` answer version whose only content change is the corrected Feishu community source title and URL.

**Architecture:** Use the existing loopback-only admin publication API so history remains immutable. Capture the complete public question list before publication, republish the target with unchanged answer text and corrected `sources`, then compare all non-target records and verify the rendered link in a real browser.

**Tech Stack:** PowerShell, Fastify admin API, PostgreSQL-backed published answer versions, Vue question deck, Playwright/Edge.

## Global Constraints

- Target intent ID: `financial-aid`.
- Source title: `2026年本科生奖助评优政策`.
- Source URL: `https://scnbcye3xdfz.feishu.cn/wiki/A8NBwNTmOiCQkMksCT5cqC5bnzf`.
- Source type: `community`.
- Source date: `2026-07-31`.
- Preserve the current summary and full answer byte-for-byte.
- Do not change any other published question.
- Do not hardcode the URL in Vue source code or mutate a historical database row.

---

### Task 1: Capture and validate the publication baseline

**Files:**
- Create runtime snapshot: `D:/Star/LIVE_IN_HDU_RUNTIME/worktrees-data/live-in-hdu-feedback/verification/financial-aid-before.json`
- Read: `GET http://127.0.0.1:3210/api/questions`

**Interfaces:**
- Consumes: the public `{ items: PublishedQuestion[] }` response.
- Produces: a complete pre-publication snapshot and a target object with `id`, `summary`, and `fullAnswer`.

- [ ] **Step 1: Fetch all published questions and require exactly one target**

Use PowerShell to fetch `/api/questions`, require 23 items, and require exactly one item whose ID is `financial-aid`.

- [ ] **Step 2: Write the snapshot under the D-drive runtime**

Serialize `{ capturedAt, items }` as UTF-8 JSON to the exact runtime path above. Do not place runtime data in the Git worktree.

- [ ] **Step 3: Confirm the baseline source is the incorrect team table**

Require the current target source title to equal `2026 新生 40 问团队协作总表（用户已人工审核）`; stop without publishing if the database has already changed.

---

### Task 2: Publish the corrected immutable version

**Files:**
- Read: `D:/Star/LIVE_IN_HDU_RUNTIME/worktrees-data/live-in-hdu-feedback/verification/financial-aid-before.json`
- Call: `POST http://127.0.0.1:3210/api/admin/intents/financial-aid/publish`

**Interfaces:**
- Consumes: baseline `summary` and `fullAnswer`.
- Produces: a new published answer version through `PublishAnswerInput`.

- [ ] **Step 1: Build the exact publication payload**

```json
{
  "summary": "先看社区的“2026年本科生奖助评优政策”，再跟随学院通知提交材料；助学贷款和勤工助学需另外关注学工部门通知。",
  "fullAnswer": "社区的“2026年本科生奖助评优政策”归档了国家奖学金、励志奖学金、省政府奖学金、国家助学金、资助对象认定、困难补助、校内本科生奖学金，以及三好学生和优秀学生干部评审等正式文件。实际申请仍要跟着学院通知走，按时提交表格和证明材料；家庭经济困难类资助通常要先关注资助对象认定。助学贷款和勤工助学不在上述文件的完整覆盖范围内，需要另外查看学工部门通知。",
  "sources": [
    {
      "type": "community",
      "title": "2026年本科生奖助评优政策",
      "url": "https://scnbcye3xdfz.feishu.cn/wiki/A8NBwNTmOiCQkMksCT5cqC5bnzf",
      "updatedAt": "2026-07-31"
    }
  ],
  "reviewerId": "owner-approved-link-correction"
}
```

Before posting, require both answer strings above to equal the baseline values exactly; stop if either differs.

- [ ] **Step 2: POST the payload once**

Require HTTP success and a response containing a versioned answer ID matching `financial-aid:v<version>` plus a numeric `version`. Do not retry automatically because publication is intentionally version-creating. If the request succeeds but a local response assertion fails, inspect the published state instead of submitting again.

---

### Task 3: Prove only the intended source changed

**Files:**
- Read: baseline snapshot on D.
- Read: `GET http://127.0.0.1:3210/api/questions` after publication.

**Interfaces:**
- Consumes: before and after question arrays.
- Produces: structural comparison evidence.

- [ ] **Step 1: Compare collection identity and non-target records**

Require the after collection to contain the same 23 IDs. For every item except `financial-aid`, compare its JSON serialization against the baseline while ignoring no fields; each must be identical.

- [ ] **Step 2: Compare the target answer fields**

Require `question`, `summary`, `fullAnswer`, `category`, `featured`, and `displayOrder` to equal the baseline. Allow the target's version-derived update timestamp to change.

- [ ] **Step 3: Verify the corrected source**

Require exactly one source with the exact type, title, URL, and date from Global Constraints. Require the old team-table title and URL to be absent from the target.

---

### Task 4: Verify the rendered link and record the operational plan

**Files:**
- Verify: `http://127.0.0.1:5174/questions`
- Commit: `docs/superpowers/plans/2026-08-08-financial-aid-source-link.md`

**Interfaces:**
- Consumes: the Vite frontend and corrected real API data.
- Produces: browser evidence that the existing `SourceList` renders a safe clickable link.

- [ ] **Step 1: Open the target question in a 448 × 898 browser viewport**

Select the `financial-aid` card and expand its full answer.

- [ ] **Step 2: Inspect the source anchor**

Require visible text `2026年本科生奖助评优政策`, exact `href`, `target="_blank"`, and `rel` containing both `noopener` and `noreferrer`. Require the old source title to be absent.

- [ ] **Step 3: Click and confirm the destination**

Click the source, capture the popup URL, and require it to begin with the exact Feishu document URL. Close the popup without editing the document.

- [ ] **Step 4: Run regression checks**

From `apps/freshman-mvp`, run `npm run test:web`. From the worktree root, run `git diff --check` and a secret-pattern scan on the plan file.

- [ ] **Step 5: Commit the plan**

```powershell
git add -- docs/superpowers/plans/2026-08-08-financial-aid-source-link.md
git commit -m "docs: plan financial aid source correction"
```
