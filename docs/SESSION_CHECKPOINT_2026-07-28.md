# 2026-07-31 可恢复暂停检查点

## 恢复入口

- 工作区：`C:\Users\Star\Desktop\总项目文件\杭电飞书社区`
- 分支：`codex/local-agent-platform`
- 最近完成的文档提交：`ed30673 docs: record admin health acceptance`
- 当前状态：Phase A 已验证；Phase B 非依赖代码与静态运维检查已完成，但真实知识栈未部署。
- 暂停状态：2026-07-31（Asia/Shanghai）已按用户要求停止继续部署；端口
  `3210`、`5433`、`8080`、`8888`、`11434` 均未监听。重启电脑后不会自动启动，
  需手动运行启动脚本。
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
当前同一 Wi-Fi 首选用户地址为 `http://192.168.111.117:3210`；
`172.24.64.1` 与 `10.99.0.1` 也在本机验证为 HTTP 200，但更可能属于虚拟网卡。

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
- 最近一次运行健康快照为 `status=ok`：
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
- 预检只剩两个本机软件失败项：`docker-cli-missing` 与
  `ollama-cli-missing`。
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

1. 重启后先按“恢复入口”启动 Phase A，确认健康接口和页面；当前生产数据仍是
   35 个意图、31 条原始回答、0 条已发布答案，因此用户首页空列表是预期结果。
2. 自动浏览器验收已经完成；实体手机同一 Wi-Fi 测试仍需人工执行。
3. 如进入 Phase B，先安装 Docker Desktop 与 Ollama，并在任何拉镜像/模型之前
   验证 Docker 磁盘镜像和 Ollama 模型目录实际位于 D 盘。
4. 先运行 PostgreSQL 相关聚焦测试并审阅 npm audit 报告，再配置真实的
   TokenDance/WeKnora 密钥与两个知识库 ID。
5. 取得明确获批的《2025年新生指南》原文件后，才可创建审批清单并导入。
6. 完成 PostgreSQL 迁移、WeKnora 导入、20 问检索评测、新命名卷恢复演练、
   两轮真实知识栈测试和实体手机验收；真实测试时按环境变量提供一条预设问题、
   一条知识库问题和一条未知问题。

## 外部阻塞与禁止事项

- 缺 Docker Desktop、Ollama、真实密钥和两个 WeKnora 知识库 ID。
- 缺明确确认且获批的《2025年新生指南》原始文件。
- 不导入整个 `最新资料`，不自动发布原始回答。
- Q11 继续空白，纯数字 `19` 继续拒绝为回答。
- 不提交 `.env.local`、API Key 或数据库密码。
- 不执行 `docker compose down -v`。
- 不把用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件加入提交。
