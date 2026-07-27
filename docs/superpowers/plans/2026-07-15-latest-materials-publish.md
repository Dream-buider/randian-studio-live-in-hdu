# Latest Materials Publishing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. This workspace is not a Git repository, so verification reports and `CHANGELOG.md` replace commit checkpoints.

**Goal:** Classify, deduplicate, publish, and verify the 24 files under `最新资料`, then document the 2026-07-15 community update.

**Architecture:** Preserve every source file. Extract text and structure into temporary inspection data, map non-duplicate files to a small number of existing LIVE IN HDU branches, and publish through one idempotent Playwright script. The script must support dry-run validation, skip existing attachments, upload only approved files, update the Feishu changelog page, and emit a machine-readable report.

**Tech Stack:** Node.js ES modules, `playwright-core`, bundled Python document/PDF tooling, Feishu Wiki, Markdown/JSON verification records.

## Global Constraints

- Never delete or rename files in `最新资料` during this run.
- Do not publish exact duplicates or superseded drafts.
- Policy documents must be labeled with issue date and a reminder to follow the latest official notice.
- Course evaluations and student notes must be labeled as experience-based, not official conclusions.
- Every uploaded attachment must be verified by page readback.
- No GitHub crawling begins until this batch is published and verified.

---

### Task 1: Inspect and classify all source files

**Files:**
- Read: `最新资料/*`
- Create: `docs/社区更新_2026-07-15/material-inspection.json`

- [ ] Extract page counts, titles, dates, headings, sheet names, slide titles, and representative text.
- [ ] Compare hashes and normalized extracted text for duplicates and near-duplicates.
- [ ] Assign each file to one of five groups: awards/aid, competitions, elective courses, digital/electrical analysis, embedded systems.
- [ ] Mark each file `publish`, `skip_duplicate`, `skip_superseded`, or `needs_review` with a concrete reason.
- [ ] Verify the manifest contains exactly 24 source records and every source path exists.

### Task 2: Build and validate the publishing manifest

**Files:**
- Create: `scripts/latest-materials-2026-07-15-manifest.mjs`
- Create: `scripts/latest-materials-2026-07-15-manifest.test.mjs`

- [ ] Write a failing Node test requiring unique source paths, existing files, allowed decisions, non-empty target page titles, and unique upload names per page.
- [ ] Run the test and confirm it fails before the manifest exists.
- [ ] Implement the manifest using the inspection decisions from Task 1.
- [ ] Run the test and confirm all 24 records pass validation.

### Task 3: Implement idempotent Feishu publication

**Files:**
- Create: `scripts/publish-latest-materials-2026-07-15.mjs`
- Generate: `docs/社区更新_2026-07-15/feishu-upload-report-latest-materials-2026-07-15.json`

- [ ] Reuse the persistent Edge profile and page-tree lookup patterns from prior dated publishing scripts.
- [ ] Add a dry-run path that resolves target parent pages and prints every planned page/file without editing Feishu.
- [ ] Create or reuse one content page per approved subject group, write page-specific scope/source warnings, and upload only `publish` records.
- [ ] Detect existing attachments before upload so reruns are idempotent.
- [ ] Append a concise `2026-07-15` entry to the Feishu `更新日志` page.
- [ ] Emit per-page expected, uploaded, existing, missing, and skipped counts.

### Task 4: Publish and verify in the live community

**Files:**
- Read: `docs/社区更新_2026-07-15/feishu-upload-report-latest-materials-2026-07-15.json`
- Create screenshots under: `output/playwright/`

- [ ] Run manifest tests.
- [ ] Run the publisher in dry-run mode and require all target pages to resolve.
- [ ] Run the live publisher once.
- [ ] Re-run it to confirm no duplicate uploads occur.
- [ ] Read back every target page and require `missingFileCount=0` for approved attachments.
- [ ] Capture one verification screenshot per target page and one screenshot of the updated Feishu changelog.

### Task 5: Record the completed batch

**Files:**
- Create: `docs/社区补充资料发布清单_2026-07-15.md`
- Modify: `README.md`
- Modify: `TASKS.md`
- Modify: `CHANGELOG.md`

- [ ] Record source count, upload count, skipped files and reasons, page locations, policy/experience caveats, and verification results.
- [ ] Add one completed content task and one execution-history row to `TASKS.md`.
- [ ] Add a dated Added/Changed/Verification/Notes entry to `CHANGELOG.md`.
- [ ] Update the README current-state summary without rewriting unrelated history.
- [ ] Cross-check all Markdown counts against the machine report.

