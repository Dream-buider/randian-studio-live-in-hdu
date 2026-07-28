# 2026-07-28 暂停检查点

## 恢复入口

- 分支：`codex/local-agent-platform`
- 暂停前最后一个完整功能提交：`ed19560 feat: add approved knowledge import retry`
- 本检查点提交包含运维文档、计划状态，以及下一步健康接口的 RED 测试。
- Goal 仍应保持 active；Phase A 可运行，Phase B 不得宣称真实部署完成。

## 已完成并提交

- Phase A Vue + Fastify + SQLite 本地平台。
- D 盘 junction、启停、测试、备份恢复和 Edge 390×844 模拟验收。
- PostgreSQL 仓储与迁移器、WeKnora 检索、SearXNG、FAQ outbox。
- 审批知识清单校验、哈希幂等、导入记录、公开 REST 上传、管理页状态。
- 失败知识条目按原审批清单和原 SHA-256 重试。
- 业务 PostgreSQL 17 与 WeKnora PostgreSQL 分离。
- D 盘知识栈启停、测试和备份脚本。
- `docs/PHASE_B_LOCAL_RUNBOOK.md`。

## 当前故意停在 RED 的一步

正在增强 `/api/health`，使其同时报告：

- `gateway`
- `businessDatabase`
- `weknora`
- `embedding`
- `tokenDance` 的配置状态与最近真实调用状态/时间
- `search`
- `reviewQueue`
- `integrationOutbox`

已先修改：

- `apps/freshman-mvp/test/tokendance-provider.test.ts`
- `apps/freshman-mvp/test/e2e-v2.test.ts`

测试当前预期失败，因为 `TokenDanceProvider.status()` 和扩展健康结构尚未实现。
恢复时必须继续 TDD：先重跑并确认 RED，再实现最小代码，最后跑聚焦测试和 build。

## 恢复后的顺序

1. 实现 TokenDance 最近真实调用状态，不允许健康接口主动调用模型。
2. 扩展健康 JSON，同时保留旧的 `database/model/knowledge` 兼容字段。
3. 跑聚焦后端测试、前端 31 项和 build。
4. 更新两份实施计划。
5. 连续运行两次完整 Phase A 验证。
6. 再做静态 Phase B 验证、密钥扫描、D 盘占用检查。
7. 启动 Phase A，确认 `http://localhost:3210` 与 `/admin`。

## 尚需外部条件

- Docker Desktop 未安装，且必须把磁盘镜像迁到
  `D:\Star\LIVE_IN_HDU_RUNTIME\docker` 后才允许拉镜像。
- Ollama 未安装；模型必须放在
  `D:\Star\LIVE_IN_HDU_RUNTIME\phase-b\ollama-models`。
- npm registry 当前连接超时，`pg` 与 `@types/pg` 尚未下载到 D 盘 node_modules。
- 缺 TokenDance/WeKnora 真实密钥与两个知识库 ID。
- 缺明确确认且获批的《2025年新生指南》原始文件。
- 未做真实 PostgreSQL 迁移、WeKnora 导入、20 问检索评测和新卷恢复演练。
- 未做实体手机同一 Wi-Fi 验收。

## 不能触碰

- 不导入整个 `最新资料`。
- 不自动发布任何原始回答。
- Q11 继续空白，纯数字 `19` 继续拒绝为回答。
- 不提交 `.env.local`、API Key 或数据库密码。
- 不执行 `docker compose down -v`。
- 不把用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件加入提交。
