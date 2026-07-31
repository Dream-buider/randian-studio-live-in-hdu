# 2026-07-31 可恢复暂停检查点

## 恢复入口

- 工作区：`C:\Users\Star\Desktop\总项目文件\杭电飞书社区`
- 分支：`codex/local-agent-platform`
- 检查点提交：以本文所在提交为准，恢复时运行 `git log -1 --oneline`。
- 当前状态：Phase A 已验证；Phase B 已完成 D 盘 Docker/Ollama 安装和真实业务
  PostgreSQL 联调，但 WeKnora/SearXNG 与嵌入模型尚未完成。
- 暂停状态：2026-07-31（Asia/Shanghai）已按用户要求停止继续部署；业务容器、
  Docker Desktop、Ollama 服务与应用网关均已停止。端口 `3210`、`5433`、`8080`、
  `8081`、`8082`、`8888`、`11434` 已复核为 0 个监听。重启后需要手动恢复相应服务。
- 运行根目录：`D:\Star\LIVE_IN_HDU_RUNTIME`

恢复时先执行：

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
git status --short --branch
git log -3 --oneline
Get-Content .\docs\SESSION_CHECKPOINT_2026-07-28.md
```

如只恢复 Phase A，再运行 `.\scripts\start-freshman-platform.ps1`。如继续 Phase B，
先启动 Docker Desktop 与 Ollama，随后运行
`.\scripts\preflight-phase-b.ps1 -JsonOutput .\output\freshman-platform\phase-b-preflight.json`。
在模型仍缺失时不要强行运行完整知识栈。用户端为 `http://localhost:3210`，审核后台
为 `http://localhost:3210/admin`；服务启动后电脑必须保持开机且不能休眠。

## 已完成并验证

- Phase A：Vue 手机 H5、Fastify、SQLite、动态问题卡、知识条目、未知问题即时回复与
  FIFO 审核、人工发布版本、管理端、D 盘运行、启停、在线备份和恢复。
- 数据基线：35 个意图、31 条原始回答、0 条自动发布答案；Q11 为空，纯数字
  `19` 不会被当成回答。
- 健康接口：独立报告 gateway、businessDatabase、TokenDance 最后一次真实调用、
  WeKnora、embedding、search、reviewQueue 和 integrationOutbox；健康检查不会调用模型。
- Phase B 非依赖代码：PostgreSQL 17 仓储与迁移器、WeKnora REST、SearXNG、
  FAQ outbox、审批清单导入与失败重试、D 盘运维脚本。
- 2026-07-29 连续两次完整平台验证均通过：
  - 后端 132 项：130 通过、2 项因真实外部环境缺失而明确跳过、0 失败；
  - 前端 34/34；
  - 旧 MVP 29/29；
  - 生产构建、密钥扫描、HTTP 冒烟、SQLite 在线备份和启停验证全部通过。
- 新增 Phase B API 验收契约，覆盖预设问题、知识库、联网兜底精确批注、
  “先入审核队列再返回”、并发未知问题唯一序号以及
  `created_at ASC, ordinal ASC`；真实知识栈用例仍由
  `PHASE_B_LIVE_E2E=1` 显式开启，不会在普通测试中擅自启动 Docker。
- Phase B 静态检查通过：
  `start-knowledge-stack -StaticOnly`、
  `test-knowledge-stack -StaticOnly`、
  `backup-knowledge-stack -StaticOnly`。
- Docker Desktop 4.84.0、Docker Engine 29.6.2、Compose 5.3.1 与 Ollama 0.32.5
  已安装到 `D:\Star\LIVE_IN_HDU_RUNTIME`，Docker WSL 虚拟磁盘和 CLI 插件均已
  复核在 D 盘；`hello-world` 容器运行成功。
- 业务 PostgreSQL 17.10 容器曾在 `127.0.0.1:5433` 健康运行，数据绑定到
  `D:\Star\LIVE_IN_HDU_RUNTIME\postgres`。真实契约覆盖答案版本、事务回滚、
  20 条并发 FIFO、ISO 时间戳和重启持久化。
- SQLite 迁移前备份位于
  `D:\Star\LIVE_IN_HDU_RUNTIME\backups\sqlite-before-postgres\live-in-hdu-2026-07-31T04-14-10-222Z.db`。
  真实迁移结果为 35 个意图、99 个别名、31 条原始回答、0 条发布答案、0 条审核；
  Q11 仍为空，第二次复跑写入 0 条且源/目标计数一致。
- 2026-07-31 最新回归：后端 134 项中 133 通过、1 项真实完整知识栈因未显式开启而
  跳过、0 失败；前端 34/34；真实 PostgreSQL 契约已包含在本轮；生产构建成功。
- `start-knowledge-stack.ps1 -PrepareOnly` 已生成被 Git 忽略且不输出密钥的最小
  WeKnora 环境；SearXNG 已在 `127.0.0.1:8888` 单独运行。网关以真实 PostgreSQL
  模式重启前后均为 35 个意图、0 个审核、0 个已发布答案，Q11 仍为空。
- 2026-07-29 的 Phase A 运行健康快照为 `status=ok`：
  SQLite healthy，TokenDance disabled/no-key，WeKnora not-configured，
  search unavailable/phase-a-disabled，待审核 0，outbox 0。
- 隔离数据库浏览器验收已通过：390×844 手机界面、提问抽屉、第三阶段精确批注、
  管理端“第 1 个未收录”、FIFO 待审核队列、重启后持久化均已验证；
  浏览器控制台错误与页面错误均为 0。该验收使用合成隔离数据，不代表生产内容已发布。
- 管理端已增加只读服务状态面板；真实 Edge 页面验证可如实显示 SQLite、
  TokenDance、WeKnora、搜索、审核队列和 FAQ 同步状态。健康接口失败或悬挂时
  不会阻塞内容审核区域。

## D 盘与本机状态

- `apps/freshman-mvp/runtime`、`dist`、`node_modules` 以及
  `output/freshman-platform`、浏览器产物均通过 junction 指向 D 盘。
- 当前知识栈预检报告：
  `D:\Star\LIVE_IN_HDU_RUNTIME\knowledge\phase-b-preflight-current.json`。
- 完整预检仍受 `embedding-model-missing` 阻塞；当前校园网络 DNS 无法解析
  `registry.ollama.ai`，宿主机访问 `registry-1.docker.io` 也出现 DNS/HTTPS
  失败，`nomic-embed-text:latest` 与 WeKnora 主栈镜像因此尚未下载完整。
  不要擅自修改系统 DNS、VPN 或代理。
- 2026-07-31 npm registry 网络恢复，已安装 `pg@8.22.0` 与
  `@types/pg@8.20.0`，`npm ls pg @types/pg --depth=0` 通过；对应
  `package-lock.json` 变更已保留。
- `C:\Users\Star\.wslconfig` 已写入 12 GB 内存、12 核、8 GB D 盘 swap 配置；
  需在安装 Docker/Ollama 后重启 WSL/Docker 才会生效。
- 本次 `npm install` 会把 `apps/freshman-mvp/node_modules` junction 替换成
  C 盘实体目录。已将新依赖迁回
  `D:\Star\LIVE_IN_HDU_RUNTIME\node_modules\freshman-mvp\node_modules` 并重建
  junction，C 盘临时占用已释放；迁移前的 D 盘依赖保留为
  `node_modules.pre-pg-20260731`，便于必要时回退。
- 后续不要直接对该 junction 再执行普通 `npm install`。如需更新依赖，应先设置
  D 盘 `TEMP`、`TMP` 和 npm cache，并在安装后复核 junction 与实际磁盘落点。
- 本次安装报告 14 个 npm audit 告警（1 moderate、13 high），尚未做依赖升级；
  恢复后应先区分生产依赖与开发依赖，禁止直接运行 `npm audit fix --force`。

## 下一步工作

1. 启动 Docker Desktop 与 Ollama，先重试
   `ollama pull nomic-embed-text:latest`；若 DNS 仍失败，只记录失败，不修改系统
   DNS/VPN，不从非官方来源下载模型。
2. 模型可用后重跑 Phase B 预检，再由
   `.\scripts\start-knowledge-stack.ps1` 启动 WeKnora/SearXNG 和网关。
3. 配置真实 TokenDance/WeKnora 密钥与两个知识库 ID；不要在日志中打印连接串或密钥。
4. 自动浏览器验收已经完成；实体手机同一 Wi-Fi 测试仍需人工执行。
5. 取得明确获批的《2025年新生指南》原文件后，才可创建审批清单并导入。
6. 完成 PostgreSQL 迁移、WeKnora 导入、20 问检索评测、新命名卷恢复演练、
   两轮真实知识栈测试和实体手机验收；真实测试时按环境变量提供一条预设问题、
   一条知识库问题和一条未知问题。

## 外部阻塞与禁止事项

- 缺 Ollama 嵌入模型、真实密钥和两个 WeKnora 知识库 ID；模型下载当前受 DNS 阻塞。
- 缺明确确认且获批的《2025年新生指南》原始文件。
- 不导入整个 `最新资料`，不自动发布原始回答。
- Q11 继续空白，纯数字 `19` 继续拒绝为回答。
- 不提交 `.env.local`、API Key 或数据库密码。
- 不执行 `docker compose down -v`。
- 不把用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件加入提交。
