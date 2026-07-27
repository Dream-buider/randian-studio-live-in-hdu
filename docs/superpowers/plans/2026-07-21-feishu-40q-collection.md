# Feishu 40-Question Collection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create and verify a Feishu Bitable containing the 40-question source table, a non-overwriting answer collection table, and a contributor form.

**Architecture:** Generate one validated `.xlsx` import artifact from `apps/freshman-mvp/data/presets.json`, then import it into Feishu Bitable through the authenticated browser. Configure response-only fields and a form view in Feishu so each submission becomes an independent record.

**Tech Stack:** Node.js, `@oai/artifact-tool`, Kimi WebBridge, Feishu Bitable

## Global Constraints

- The question source is `apps/freshman-mvp/data/presets.json`.
- Question IDs must remain Q01 through Q40 in collection-document order.
- Exactly 40 unique questions must be imported.
- Contributors add answer records and never overwrite question-source rows.
- No knowledge-base or preset-answer integration is included.

---

### Task 1: Build and validate the import workbook

**Files:**
- Create: `scripts/build-feishu-40q-import.mjs`
- Create: `outputs/2026-07-21-feishu-40q/2026新生40问_飞书导入版.xlsx`

**Interfaces:**
- Consumes: `{ items: PresetIntent[] }` from `apps/freshman-mvp/data/presets.json`
- Produces: an `.xlsx` workbook with sheets `问题库` and `回答征集`

- [ ] Create a workbook builder that maps all 40 intents into `问题库` and adds response-field headers to `回答征集`.
- [ ] Apply readable header styling, wrapped question text, filters, frozen headers, and list validation for categorical response fields.
- [ ] Inspect `问题库!A1:E41` and `回答征集!A1:K6`, scan for formula errors, and render both sheets.
- [ ] Export exactly one `.xlsx` import artifact.

### Task 2: Create the Feishu Bitable

**Files:**
- Read: `outputs/2026-07-21-feishu-40q/2026新生40问_飞书导入版.xlsx`

**Interfaces:**
- Consumes: the validated workbook from Task 1
- Produces: a Feishu Bitable named `2026 新生 40 问｜学长学姐真实回答征集`

- [ ] Open Feishu in a new authenticated WebBridge session.
- [ ] Create a Bitable by importing the workbook.
- [ ] Confirm both source sheets became Bitable tables and that `问题库` contains 40 records.

### Task 3: Configure the answer table and form

**Interfaces:**
- Consumes: the imported `回答征集` table
- Produces: contributor-safe fields and a form view

- [ ] Set categorical fields for information nature and review status; keep review status defaulted to `待审核`.
- [ ] Create a form view titled `提交一份学长学姐真实回答`.
- [ ] Include the question selector, answer text, identity/background, date, source, and notes fields; exclude review status from contributor input.

### Task 4: Verify and hand off

**Interfaces:**
- Consumes: the live Bitable and form
- Produces: verified Bitable and form share URLs

- [ ] Reopen the Bitable, confirm table names, field names, and Q01–Q40 record count.
- [ ] Open the form entry and confirm a contributor can reach all intended input fields.
- [ ] Return the Bitable link and the form link without changing access permissions beyond the user's current Feishu defaults.
