# 成员 3 最终前端与真实 API 融合实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不回退本机真实业务能力的前提下，把成员 3 最终用户端前端接到真实 3210 API 并完成本地验收。

**Architecture:** 以 `codex/live-in-hdu-feedback` 的最新真实版本为基线，只移植开源成员分支 `d149672` 相对共同应用基线的前端增量。真实 API 契约保留，UI Preview 通过动态导入隔离，正式构建增加泄漏门禁。

**Tech Stack:** Vue 3、Vue Router、Vite、Vitest、TypeScript、OGL、Fastify、本机 3210 API。

## Global Constraints

- 保留成员 3 当前原版流星效果；不实施单向或 28 条流星改造。
- 不修改后端业务、数据库、WeKnora、TokenDance、密钥和 D 盘运行时数据；只补充 `/questions` 的 SPA 路由白名单。
- 正式模式不得回退到 mock；API 失败必须显式失败。
- 管理端继续保留在本地构建，公开体验构建继续排除管理端。
- 所有代码改动先通过失败测试证明缺口，再做最小实现。

---

### Task 1: 锁定最终用户端路由和真实 API 边界

**Files:**
- Modify: `apps/freshman-mvp/test/web/public-trial-router.test.ts`
- Modify: `apps/freshman-mvp/test/web/question-deck.test.ts`
- Create: `apps/freshman-mvp/test/web/welcome-view.test.ts`
- Create: `apps/freshman-mvp/test/web/countdown.test.ts`
- Create: `apps/freshman-mvp/test/web/arrival-lightfall.test.ts`
- Modify: `apps/freshman-mvp/test/web/ui-preview.test.ts`

**Interfaces:**
- Consumes: 当前真实 `PublishedQuestion`、`AnswerResult` 与路由工厂。
- Produces: `/` 欢迎页、`/questions` 问题卡和正式模式真实 fetch 的回归契约。

- [ ] 迁移成员 3 的 Web 合同测试与新增测试文件。
- [ ] 运行 `npm run test:web`，确认因欢迎页、倒计时、OGL 或 UI Preview 能力缺失而失败。

### Task 2: 移植最终视觉、资源和隔离式 UI Preview

**Files:**
- Create: `apps/freshman-mvp/web/views/WelcomeView.vue`
- Create: `apps/freshman-mvp/web/components/ArrivalLightfall.vue`
- Create: `apps/freshman-mvp/web/countdown.ts`
- Create: `apps/freshman-mvp/web/mock/questions.ts`
- Create: `apps/freshman-mvp/web/mock/answers.ts`
- Create: `apps/freshman-mvp/scripts/assert-no-ui-preview-data.mts`
- Create: `apps/freshman-mvp/web/public/brand/campus-dawn-welcome.webp`
- Create: `apps/freshman-mvp/web/public/fonts/hdu-arrival-display.woff2`
- Create: `apps/freshman-mvp/web/public/fonts/OFL-hdu-arrival-display.txt`
- Modify: `apps/freshman-mvp/web/router.ts`
- Modify: `apps/freshman-mvp/web/api.ts`
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Modify: `apps/freshman-mvp/web/views/QuestionDeckView.vue`
- Modify: `apps/freshman-mvp/web/views/ChatView.vue`
- Modify: `apps/freshman-mvp/web/views/GuideView.vue`
- Modify: `apps/freshman-mvp/web/components/AskSheet.vue`
- Modify: `apps/freshman-mvp/web/components/QuestionCatalog.vue`
- Modify: `apps/freshman-mvp/vite.config.ts`
- Modify: `apps/freshman-mvp/package.json`
- Modify: `apps/freshman-mvp/package-lock.json`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `GET /api/questions`、`POST /api/ask`、现有管理 API。
- Produces: 成员 3 最终视觉、`ui-preview` 动态 mock 和生产构建泄漏门禁。

- [ ] 用共同基线补丁移植所有文本前端增量，二进制资源逐项复制并校验 SHA-256。
- [ ] 保留本机最新 API 类型和校验，仅叠加 `ui-preview` 分支和可注入 fetcher。
- [ ] 安装锁定依赖，运行 `npm run test:web` 直到全部通过。

### Task 3: 完整构建与真实本地验收

**Files:**
- Modify: `apps/freshman-mvp/src/server/app.ts`
- Modify: `apps/freshman-mvp/src/public-trial/app.ts`
- Modify: `apps/freshman-mvp/test/e2e-v2.test.ts`
- Modify: `apps/freshman-mvp/test/public-trial-gateway.test.ts`
- Verify: all modified files and local runtime.

**Interfaces:**
- Consumes: 融合后的客户端和既有真实后端。
- Produces: 可在本机浏览器操作的最终前端与真实数据链路。

- [ ] 运行 `npm run test:all`。
- [ ] 运行 `npm run build`。
- [ ] 运行 `npm --prefix apps/freshman-mvp run build:trial`。
- [ ] 先在两个网关测试中加入 `/questions` 的 GET/HEAD 契约并确认 404，再把 `/questions` 加入两个 SPA 白名单并确认测试通过。
- [ ] 运行 `git diff --check` 并核对 `apps/freshman-mvp/src/**` 只包含两个网关的 `/questions` 白名单改动，且不含密钥或运行时数据。
- [ ] 启动本机真实后端和融合前端，验证 `/api/health`、`/api/questions`、`/`、`/questions`、`/guide`、`/admin`。
- [ ] 在真实页面提交一个不会产生破坏性写入的已发布问题或只读提问流程，确认回答来源于真实 API 而非模拟数据。
