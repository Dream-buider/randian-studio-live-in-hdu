# Freshman Guide Signal Stations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `/guide` 的四个新生指北栏目改造成具有完整动效节奏的纵向校园信号站，同时完整保留现有内容、链接和问题界面。

**Architecture:** 继续直接消费 `FRESHMAN_GUIDE_SECTIONS`，不改变数据模型。`GuideView.vue` 负责有序路线语义和站点标记，`tokens.css` 负责信号线、站点表面、响应式与 reduced-motion；Vitest 通过真实挂载验证栏目与外链未丢失。

**Tech Stack:** Vue 3、Vue Router、TypeScript、CSS、Vitest、Vue Test Utils

## Global Constraints

- 不修改问题界面、路由、API、Mock、后端、Admin、依赖或构建配置。
- 不修改 `FRESHMAN_GUIDE_SECTIONS` 的内容、顺序和链接。
- 动效仅使用 `transform` 和 `opacity`，并保留 `prefers-reduced-motion` 最终静态状态。
- 所有交互目标至少 `44px`，保留可见键盘焦点。
- 未经用户额外确认，不执行 commit、push 或 PR。

---

### Task 1: 锁定信号站路线的可观察行为

**Files:**
- Create: `apps/freshman-mvp/test/web/guide-view.test.ts`
- Test: `apps/freshman-mvp/test/web/guide-view.test.ts`

**Interfaces:**
- Consumes: `FRESHMAN_GUIDE_SECTIONS` 和 `GuideView.vue`
- Produces: `data-role="signal-route"`、`data-role="signal-station"`、`data-role="station-index"` 的稳定可访问结构

- [ ] **Step 1: 写失败测试**

测试真实挂载 `GuideView`，断言：路线具有“新生指北信号站”标签；四个有序站点按 `01` 至 `04` 呈现；每站保留原始标题、摘要、主题和安全外链；返回问答入口仍为 `/questions`。

- [ ] **Step 2: 运行测试并确认按预期失败**

Run: `npm run test:web -- test/web/guide-view.test.ts`

Expected: FAIL，因为当前页面不存在 `data-role="signal-route"`。

### Task 2: 实现信号站语义结构

**Files:**
- Modify: `apps/freshman-mvp/web/views/GuideView.vue`
- Test: `apps/freshman-mvp/test/web/guide-view.test.ts`

**Interfaces:**
- Consumes: `FRESHMAN_GUIDE_SECTIONS` 原始字段
- Produces: 有序站点路线、站点序号、栏目内容和原始外链

- [ ] **Step 1: 写最小模板实现**

将栏目容器改为 `<ol data-role="signal-route">`，每项使用 `<li data-role="signal-station">`，用循环索引渲染两位站点号；保留全部原始字段和安全外链属性。

- [ ] **Step 2: 运行目标测试确认通过**

Run: `npm run test:web -- test/web/guide-view.test.ts`

Expected: PASS。

### Task 3: 完成信号站视觉和动效

**Files:**
- Modify: `apps/freshman-mvp/web/styles/tokens.css`
- Test: `apps/freshman-mvp/test/web/guide-view.test.ts`

**Interfaces:**
- Consumes: Task 2 的类名和 data-role 结构
- Produces: 顶部信号接收器、杭电蓝纵向信号线、站点标识、浅色站点面板、触控反馈和 reduced-motion 静态状态

- [ ] **Step 1: 替换原指南卡片样式**

删除 `.guide-section-list` / `.guide-section-card` 的通用卡片表现，新增 `.guide-signal-hero`、`.signal-receiver`、`.guide-signal-route`、`.guide-signal-station`、`.signal-node`、`.signal-panel` 等样式；不影响 `.deck-page` 和 `.question-card`。

- [ ] **Step 2: 加入轻量动效和静态终态**

仅在 `prefers-reduced-motion: no-preference` 下播放四拍：接收器接通、线路点亮、站点依次从最终位置附近就位、交互按钮反馈；动画只使用 `transform` 和 `opacity`。现有 reduce 规则必须直接显示完整站点。

- [ ] **Step 3: 运行目标测试**

Run: `npm run test:web -- test/web/guide-view.test.ts`

Expected: PASS。

### Task 4: 闭环验证

**Files:**
- Verify only

**Interfaces:**
- Consumes: 完整学生端
- Produces: 可发布的验证证据

- [ ] **Step 1: 运行全部测试**

Run: `npm run test:all`

Expected: 全部 PASS。

- [ ] **Step 2: 运行正式构建**

Run: `npm run build`

Expected: exit code 0，且 UI preview 数据隔离检查通过。

- [ ] **Step 3: 运行公开试用构建**

Run: `npm run build:trial`

Expected: exit code 0，且公开试用断言与 UI preview 数据隔离检查通过。

- [ ] **Step 4: 浏览器验收**

在 `320×640`、`390×844`、`430×932` 和桌面居中容器检查 `/guide`：无横向溢出、路线连续、外链可点、返回问答可用、最后一站不被底部安全区遮挡；开启 reduced-motion 后内容完整静止。
