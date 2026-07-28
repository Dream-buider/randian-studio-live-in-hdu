# 2026-07-28 可恢复暂停检查点

## 恢复入口

- 工作区：`C:\Users\Star\Desktop\总项目文件\杭电飞书社区`
- 分支：`codex/local-agent-platform`
- 当前功能提交：`fa1f2a1 feat: expose honest component health state`
- 当前状态：Phase A 已验证；Phase B 非依赖代码与静态运维检查已完成，但真实知识栈未部署。
- 暂停状态：本地服务应处于停止状态，重启电脑后不会自动启动。
- 运行根目录：`D:\Star\LIVE_IN_HDU_RUNTIME`

恢复时先执行：

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
git status --short --branch
git log -3 --oneline
.\scripts\start-freshman-platform.ps1
Invoke-RestMethod http://127.0.0.1:3210/api/health | ConvertTo-Json -Depth 8
```

用户端为 `http://localhost:3210`，审核后台为
`http://localhost:3210/admin`。本地服务启动后，电脑必须保持开机且不能休眠。

## 已完成并验证

- Phase A：Vue 手机 H5、Fastify、SQLite、动态问题卡、知识条目、未知问题即时回复与
  FIFO 审核、人工发布版本、管理端、D 盘运行、启停、在线备份和恢复。
- 数据基线：35 个意图、31 条原始回答、0 条自动发布答案；Q11 为空，纯数字
  `19` 不会被当成回答。
- 健康接口：独立报告 gateway、businessDatabase、TokenDance 最后一次真实调用、
  WeKnora、embedding、search、reviewQueue 和 integrationOutbox；健康检查不会调用模型。
- Phase B 非依赖代码：PostgreSQL 17 仓储与迁移器、WeKnora REST、SearXNG、
  FAQ outbox、审批清单导入与失败重试、D 盘运维脚本。
- 两次连续完整 Phase A 验证均通过：
  - 后端 128 项：126 通过、2 项因真实外部环境缺失而明确跳过、0 失败；
  - 前端 31/31；
  - 旧 MVP 29/29；
  - 生产构建、密钥扫描、HTTP 冒烟、SQLite 在线备份和两轮启停全部通过。
- Phase B 静态检查通过：
  `start-knowledge-stack -StaticOnly`、
  `test-knowledge-stack -StaticOnly`、
  `backup-knowledge-stack -StaticOnly`。
- 暂停前最后一次健康快照（2026-07-28 23:44 +08:00）为 `status=ok`：
  SQLite healthy，TokenDance disabled/no-key，WeKnora not-configured，
  search unavailable/phase-a-disabled，待审核 0，outbox 0。

## D 盘与本机状态

- `apps/freshman-mvp/runtime`、`dist`、`node_modules` 以及
  `output/freshman-platform`、浏览器产物均通过 junction 指向 D 盘。
- 当前知识栈预检报告：
  `D:\Star\LIVE_IN_HDU_RUNTIME\knowledge\phase-b-preflight-current.json`。
- 预检只剩两个本机软件失败项：`docker-cli-missing` 与
  `ollama-cli-missing`。
- `C:\Users\Star\.wslconfig` 已写入 12 GB 内存、12 核、8 GB D 盘 swap 配置；
  需在安装 Docker/Ollama 后重启 WSL/Docker 才会生效。
- `pg` 与 `@types/pg` 已声明但尚未下载；网络恢复后必须使用 D 盘 TEMP、npm cache
  和 node_modules 安装。一次超时的 npm 安装曾移除 C 盘 junction 入口，现已安全恢复。

## 下一步工作

1. 重启后先按“恢复入口”启动 Phase A，确认健康接口和页面。
2. 如继续 Phase A 验收，用隔离的 D 盘数据库完成浏览器自动验收；实体手机同一
   Wi-Fi 测试仍需人工执行。
3. 如进入 Phase B，先安装 Docker Desktop 与 Ollama，并在任何拉镜像/模型之前
   验证 Docker 磁盘镜像和 Ollama 模型目录实际位于 D 盘。
4. 网络恢复后补装 `pg`、`@types/pg`，再配置真实的 TokenDance/WeKnora 密钥与
   两个知识库 ID。
5. 取得明确获批的《2025年新生指南》原文件后，才可创建审批清单并导入。
6. 完成 PostgreSQL 迁移、WeKnora 导入、20 问检索评测、新命名卷恢复演练、
   两轮真实知识栈测试和实体手机验收。

## 外部阻塞与禁止事项

- 缺 Docker Desktop、Ollama、可用 npm 网络、真实密钥和两个 WeKnora 知识库 ID。
- 缺明确确认且获批的《2025年新生指南》原始文件。
- 不导入整个 `最新资料`，不自动发布原始回答。
- Q11 继续空白，纯数字 `19` 继续拒绝为回答。
- 不提交 `.env.local`、API Key 或数据库密码。
- 不执行 `docker compose down -v`。
- 不把用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件加入提交。
