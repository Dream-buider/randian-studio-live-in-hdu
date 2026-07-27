# LIVE IN HDU 新生问答补充 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从 LIVE IN HDU 社区和《2025年新生指南／新生之北》中查找可靠资料，自然地补全协作表中缺失或明显不足的新生回答。

**Architecture:** 使用真实登录态浏览器读取飞书知识库，以《2025年新生指南／新生之北》为主索引，按问题建立“来源—事实—时效—拟写答案”记录。写回时先重读目标单元格，空白问题写入“回答（一）”，已有回答仅在确有问题时将独立完整答案写入“回答（二）”，最后逐格复核。

**Tech Stack:** 飞书云文档、LIVE IN HDU 飞书知识库、Kimi WebBridge、本地 Markdown 证据记录。

## Global Constraints

- Q11 不填写“回答（一）”或“回答（二）”。
- 优先阅读《2025年新生指南／新生之北》，再查社区专题文章和社区引用的一手官方资料。
- 不覆盖团队成员已有回答。
- 找不到直接、可信、足以回答问题的资料时不填写。
- 回答模仿学长学姐的自然语气，可严谨、幽默或带遗憾情绪，但不得虚构身份、专业、经历和数据。
- 逐年变化的信息只写稳定结论，并提示以 2026 年最新通知为准。

---

### Task 1: 建立检索基线与证据记录

**Files:**
- Create: `outputs/2026-07-22-live-in-hdu-backfill/evidence-log.md`
- Read: `docs/superpowers/specs/2026-07-22-live-in-hdu-answer-backfill-design.md`

**Interfaces:**
- Consumes: 当前协作表 Q01–Q35 的问题、回答要点、回答（一）、回答（二）。
- Produces: 每个问题的当前状态和后续检索优先级。

- [ ] 重新读取表格 E2:F36，确认团队成员在执行期间是否新增内容。
- [ ] 将 Q11 标为“强制跳过”。
- [ ] 将其余空白回答（一）列为第一批检索对象。
- [ ] 将已有回答（一）列为第二批质量审查对象。

### Task 2: 阅读《2025年新生指南／新生之北》并建立问题映射

**Files:**
- Modify: `outputs/2026-07-22-live-in-hdu-backfill/evidence-log.md`

**Interfaces:**
- Consumes: 第一批和第二批问题清单。
- Produces: 指南章节标题、关键事实、适用问题编号、时效风险。

- [ ] 打开 LIVE IN HDU 知识库主页并定位《2025年新生指南／新生之北》。
- [ ] 通读指南目录及与 Q01–Q35 相关的正文，不只依赖搜索摘要。
- [ ] 为每个相关问题记录页面标题、直接支持的事实和需要以 2026 通知为准的部分。
- [ ] 不把与问题只有关键词重合、但不能直接支持答案的段落计为证据。

### Task 3: 补充检索社区专题与官方引用

**Files:**
- Modify: `outputs/2026-07-22-live-in-hdu-backfill/evidence-log.md`

**Interfaces:**
- Consumes: 指南尚未充分回答的问题。
- Produces: 逐题的补充证据和“可写／不可写”结论。

- [ ] 按问题关键词检索社区专题文章和经验帖。
- [ ] 阅读社区文章引用的杭电官网、学院通知或办事系统页面，用于核对政策性信息。
- [ ] 对相互冲突的信息优先采用更新的一手资料；无法判断时标为“不可写”。
- [ ] 对每题给出“可写回答（一）”“可补回答（二）”或“资料不足”的结论。

### Task 4: 起草自然口吻回答并进行事实复核

**Files:**
- Modify: `outputs/2026-07-22-live-in-hdu-backfill/evidence-log.md`

**Interfaces:**
- Consumes: 已通过证据筛选的问题资料。
- Produces: 与问题对应、可直接写入单元格的最终文本。

- [ ] 将多份资料综合成独立答案，不逐句复制原文。
- [ ] 根据现有回答风格轮换严谨、轻松、学长式提醒或带遗憾感的语气。
- [ ] 删除虚构经历、过度绝对化结论和未经核实的数字。
- [ ] 对时效敏感信息加入“以 2026 年学校或学院最新通知为准”。
- [ ] 对已有回答（一）仅在明显错误、遗漏或过短时起草回答（二）。

### Task 5: 写回飞书表格

**Files:**
- Modify external: `2026 新生问题｜团队协作总表` 的 `40问协作总表` 工作表。

**Interfaces:**
- Consumes: Task 4 的已复核最终文本。
- Produces: 更新后的“回答（一）”和必要的“回答（二）”。

- [ ] 每次写入前重读目标 E/F 单元格。
- [ ] 若团队成员已填入内容，不覆盖；改为重新判断是否需要回答（二）。
- [ ] Q11 无条件跳过。
- [ ] 仅把有足够证据的空白问题写入回答（一）。
- [ ] 仅把确有补充价值的完整回答写入回答（二）。

### Task 6: 云端复核与结果汇报

**Files:**
- Modify: `outputs/2026-07-22-live-in-hdu-backfill/evidence-log.md`

**Interfaces:**
- Consumes: 写回后的云端表格。
- Produces: 已写入、已补充、未找到资料、因并发跳过四类结果。

- [ ] 逐格重读所有写入单元格，核对列、行和内容。
- [ ] 检查 Q11 仍为空白。
- [ ] 检查没有覆盖团队成员内容。
- [ ] 记录每个答案采用的来源及最终状态。
- [ ] 向用户汇报写回明细和仍需人工补充的问题。
