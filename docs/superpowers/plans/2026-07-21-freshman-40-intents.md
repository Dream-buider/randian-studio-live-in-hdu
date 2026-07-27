# 2026 Freshman 40 Intents Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a team-ready 40-question collection package and make preset matching intent-based with an optional DeepSeek V4 classifier.

**Architecture:** JSON remains the source of truth for active preset intents. Local matching handles known wording; an injected classifier resolves ambiguous wording. Only `approved` entries can produce a preset answer, while `collecting` entries return an explicit collection-state message during the internal prototype phase.

**Tech Stack:** Markdown, JSON, Node.js 24, DeepSeek V4 Chat Completions, `node:test`.

## Global Constraints

- The number 40 is data, never a code constant.
- Existing draft answers must not be presented as verified facts.
- Intent IDs remain stable when question wording changes.
- LLM classification returns structured intent IDs and confidence; it never authors the preset answer.
- Knowledge-base work starts only after the 40-answer integration round.

### Task 1: Team collection package

**Files:**
- Create: `docs/2026新生40问_团队征集版.md`
- Create: `docs/2026新生40问_群公告简版.md`

- [ ] Define 40 numbered questions in six categories.
- [ ] Add response metadata and evidence rules.
- [ ] Add a copy-ready group announcement and Markdown reply template.
- [ ] Verify numbering, uniqueness and category totals.

### Task 2: Intent data and collection status

**Files:**
- Replace: `apps/freshman-mvp/data/presets.json`
- Test: `apps/freshman-mvp/test/preset-intents.test.mjs`

- [ ] Write tests requiring exactly 40 unique intent IDs, aliases, descriptions and `collecting` status.
- [ ] Verify the tests fail with the current ten-item draft.
- [ ] Add all 40 intent records without unverified factual answers.
- [ ] Re-run tests.

### Task 3: Optional LLM intent classifier

**Files:**
- Modify: `apps/freshman-mvp/src/providers.mjs`
- Modify: `apps/freshman-mvp/src/answer-router.mjs`
- Modify: `apps/freshman-mvp/src/config.mjs`
- Test: `apps/freshman-mvp/test/intent-classifier.test.mjs`
- Test: `apps/freshman-mvp/test/router.test.mjs`

- [ ] Write failing tests for paraphrase classification, confidence threshold and no-key fallback.
- [ ] Implement `classifyIntent(question, intents)` using DeepSeek JSON output.
- [ ] Route approved classifier matches before the knowledge search.
- [ ] Render collecting matches as collection-state responses, never as verified answers.
- [ ] Re-run all tests.

### Task 4: Documentation and verification

**Files:**
- Modify: `apps/freshman-mvp/README.md`
- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `CHANGELOG.md`

- [ ] Document the Markdown/screenshot integration workflow.
- [ ] Run the complete MVP test suite.
- [ ] Verify the live local service with paraphrases such as “学校怎么办校园卡”.
