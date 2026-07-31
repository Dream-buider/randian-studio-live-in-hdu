# Approved FAQ Publication Pack Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a visually verified XLSX and API-ready JSON for the 23 reviewed LIVE IN HDU FAQ answers.

**Architecture:** Import the original workbook read-only with `@oai/artifact-tool`, combine only approved nonnumeric answer cells through an explicit per-question publication map, then export a clean workbook and matching JSON. Verification inspects counts, required fields, Q11 exclusion, invalid `19` exclusion, and rendered sheets.

**Tech Stack:** Node.js 24 bundled runtime, `@oai/artifact-tool` 2.8.6+, JSON, XLSX.

## Global Constraints

- Preserve `output/playwright/current-40q-2026-07-27.xlsx` unchanged.
- Q11 remains unpublished.
- Numeric-only `19` is excluded everywhere.
- Do not invent answers for blank questions.
- Final artifacts go under `outputs/019f800e-3d8c-7cd2-b9dd-97c6ab717fbb/`.

---

### Task 1: Build the approved publication dataset

**Files:**
- Create: `outputs/019f800e-3d8c-7cd2-b9dd-97c6ab717fbb/build-publication-pack.mjs`
- Read: `output/playwright/current-40q-2026-07-27.xlsx`

**Interfaces:**
- Consumes: source rows `A2:G36`.
- Produces: `publicationRows` with `externalId`, `category`, `question`, `summary`, `fullAnswer`, `sources`, `reviewerId`, `freshnessNote`.

- [x] **Step 1: Encode the 23 approved answers and source metadata.**
- [x] **Step 2: Validate unique IDs, required fields, Q11 exclusion, and absence of numeric-only answers.**
- [x] **Step 3: Reconcile the publication IDs against source workbook rows.**

### Task 2: Export XLSX and JSON

**Files:**
- Create: `outputs/019f800e-3d8c-7cd2-b9dd-97c6ab717fbb/LIVE_IN_HDU_已审核问答发布包.xlsx`
- Create: `outputs/019f800e-3d8c-7cd2-b9dd-97c6ab717fbb/LIVE_IN_HDU_已审核问答发布包.json`

**Interfaces:**
- Consumes: validated `publicationRows` and the 35 source questions.
- Produces: three-sheet workbook plus API-ready JSON array.

- [x] **Step 1: Create the publication, missing-question, and instructions sheets.**
- [x] **Step 2: Apply readable widths, wrapping, filters, freeze panes, and status formatting.**
- [x] **Step 3: Export the workbook and JSON without modifying the source.**

### Task 3: Verify content and rendering

**Files:**
- Read: both final artifacts.
- Create: sheet preview PNG files in the output directory.

**Interfaces:**
- Consumes: final XLSX and JSON.
- Produces: count reconciliation and visual verification evidence.

- [x] **Step 1: Inspect key ranges and scan for formula errors.**
- [x] **Step 2: Assert 23 published + 12 missing = 35, Q11 missing-only, and no `19`.**
- [x] **Step 3: Render and visually inspect all three worksheets.**
- [x] **Step 4: Re-run the builder to prove deterministic output.**
