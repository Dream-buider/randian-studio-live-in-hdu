# LIVE IN HDU Phase B 本地运维手册

本手册对应“业务 PostgreSQL + WeKnora + SearXNG + TokenDance 网关”的本地方案。
当前电脑已把 Docker Desktop 4.84.0、Docker Engine 29.6.2、Compose 5.3.1、
Ollama 0.32.5 和业务 PostgreSQL 17 的数据落到 D 盘。业务 PostgreSQL 已完成真实
容器、仓储契约、SQLite 迁移与幂等复跑验证；SearXNG 已在 loopback 端口真实运行
并接入 PostgreSQL 模式网关。WeKnora 主栈尚未启动，Ollama 嵌入模型因当前 DNS
无法访问模型仓库而未下载，真实密钥与两个 WeKnora 知识库 ID 也尚未配置。

## 1. 存储边界

用户要求的根目录是 `D:\`，但当前普通用户无法在 D 盘根目录直接创建目录，因此
实际运行根目录统一为：

```text
D:\Star\LIVE_IN_HDU_RUNTIME
```

大体积或持续写入的数据必须位于该目录：

| 数据 | 实际位置 |
| --- | --- |
| SQLite 兼容运行库 | `D:\Star\LIVE_IN_HDU_RUNTIME\app-runtime` |
| 构建产物 | `D:\Star\LIVE_IN_HDU_RUNTIME\dist` |
| Node 依赖 | `D:\Star\LIVE_IN_HDU_RUNTIME\node_modules` |
| 日志、PID、导入报告 | `D:\Star\LIVE_IN_HDU_RUNTIME\knowledge` |
| 业务 PostgreSQL | `D:\Star\LIVE_IN_HDU_RUNTIME\postgres` |
| Ollama 模型 | `D:\Star\LIVE_IN_HDU_RUNTIME\ollama\models` |
| Docker Desktop 磁盘镜像 | `D:\Star\LIVE_IN_HDU_RUNTIME\docker` |
| WSL 交换文件 | `D:\Star\LIVE_IN_HDU_RUNTIME\wsl-swap` |
| 备份 | `D:\Star\LIVE_IN_HDU_RUNTIME\backups` |
| TEMP、TMP、npm cache、测试产物 | 对应根目录下的 `temp`、`npm-cache`、`tests` |

Docker Desktop 已使用 `--wsl-default-data-root` 安装到上述 `docker` 目录；当前
WSL 虚拟磁盘已核对位于 D 盘。启动脚本仍会读取 Docker 设置验证；无法确认在 D 盘
时会在拉镜像前停止。

2026-07-31 实测 Docker/WSL 为 12 个处理器、12,542,226,432 字节内存和
8,589,934,592 字节 swap，说明 `.wslconfig` 已生效。新 PowerShell 会话即使没有
临时 Docker/Ollama `PATH`，预检、启动、停止和备份脚本也会从本运行根解析已验证的
CLI。可用以下只读命令核对：

```powershell
.\scripts\start-knowledge-stack.ps1 -ResolveToolsOnly
.\scripts\backup-knowledge-stack.ps1 -ResolveToolsOnly
```

仅在安装位置不同且已人工核对时，可为当前进程设置
`LIVE_IN_HDU_DOCKER_CLI` 或 `LIVE_IN_HDU_OLLAMA_CLI` 的绝对路径；脚本会拒绝
不存在的文件。不要把这两个临时覆盖写成系统级环境变量。

## 2. 首次配置

1. Docker Desktop（WSL2 后端）和 Ollama 已安装；重装时仍必须沿用本手册的 D 盘
   安装目录与数据目录。
2. `C:\Users\Star\.wslconfig` 中的 12 GB 内存、12 核、8 GB D 盘交换文件限制
   已在 Docker/WSL 重启后实测生效；配置变化后仍需重新验证。
3. 将 Ollama 模型目录设置为
   `D:\Star\LIVE_IN_HDU_RUNTIME\ollama\models`，再拉取且只拉取：

```powershell
$env:OLLAMA_MODELS = 'D:\Star\LIVE_IN_HDU_RUNTIME\ollama\models'
ollama pull nomic-embed-text:latest
```

4. 创建本地配置，真实值不得提交：

```powershell
Copy-Item .\deploy\local\.env.example .\deploy\local\.env.local
Copy-Item .\apps\freshman-mvp\.env.example .\apps\freshman-mvp\.env.local
```

`deploy/local/.env.local` 至少填写 `LIVE_IN_HDU_DB_PASSWORD`。应用配置至少填写
`TOKENDANCE_API_KEY`、`WEKNORA_API_KEY`、`WEKNORA_DOCUMENT_KB_ID` 和
`WEKNORA_FAQ_KB_ID`。密钥只进入服务端环境文件。

5. 刷新 Node 依赖：

```powershell
$env:TEMP = 'D:\Star\LIVE_IN_HDU_RUNTIME\temp'
$env:TMP = $env:TEMP
$env:npm_config_cache = 'D:\Star\LIVE_IN_HDU_RUNTIME\npm-cache'
Push-Location .\apps\freshman-mvp
npm install
Pop-Location
```

`pg@8.22.0` 与 `@types/pg@8.20.0` 已安装在 D 盘 junction 对应的依赖目录。
后续更新依赖时必须再次核对 npm 没有把 junction 替换为 C 盘实体目录。

6. 运行只读预检：

```powershell
.\scripts\preflight-phase-b.ps1 `
  -JsonOutput .\output\freshman-platform\phase-b-preflight.json
```

如果嵌入模型因外部网络暂时无法下载，可先生成被 Git 忽略的最小 WeKnora 环境：

```powershell
.\scripts\start-knowledge-stack.ps1 -PrepareOnly
```

该模式不调用 Docker、不检查嵌入模型，也不会覆盖已存在的 `vendor/WeKnora/.env`。
它只生成随机本地密码并返回不含密钥的路径报告，便于继续完成 Compose 配置检查。

## 3. 启动、停止与检查

完整启动顺序固定为业务 PostgreSQL、WeKnora/SearXNG、LIVE IN HDU 网关：

```powershell
.\scripts\start-knowledge-stack.ps1
```

知识栈会显式以 `DATABASE_PROVIDER=postgres` 启动网关。该模式不会检查、创建或
导入 SQLite，也不会把 PostgreSQL 连接串写入 PID 文件；PID 元数据只记录
`databaseProvider=postgres` 与不含凭据的 `database=postgres` 标识。Phase A
单独启动仍默认使用 SQLite，并兼容原有 PID 元数据。

安全停止顺序相反，且只执行 `stop`，不会删除数据卷：

```powershell
.\scripts\stop-knowledge-stack.ps1
```

静态检查不启动 Docker：

```powershell
.\scripts\start-knowledge-stack.ps1 -StaticOnly
.\scripts\test-knowledge-stack.ps1 -StaticOnly
.\scripts\backup-knowledge-stack.ps1 -StaticOnly
```

真实栈准备完成后运行：

```powershell
.\scripts\test-knowledge-stack.ps1
```

该脚本会执行后端测试、前端测试、旧 MVP 回归、生产构建、密钥扫描和真实组件健康
检查。上线候选版本必须连续执行两次且均通过。

## 4. 审批知识文件与导入

知识导入绝不扫描整个工作区。管理员先把明确获批的文件复制到：

```text
output\freshman-platform\approved-knowledge
```

再根据 `deploy/local/knowledge-manifest.example.json` 创建：

```text
output\freshman-platform\knowledge-manifest.json
```

每个条目必须有来源类型、适用年份、审批人和审批时间。先做无数据库、无网络干跑：

```powershell
Push-Location .\apps\freshman-mvp
npm exec -- tsx scripts/import-approved-knowledge.mts `
  --manifest ..\..\output\freshman-platform\knowledge-manifest.json `
  --approved-root ..\..\output\freshman-platform\approved-knowledge `
  --dry-run
Pop-Location
```

确认后再真实导入并等待解析：

```powershell
Push-Location .\apps\freshman-mvp
npm exec -- tsx scripts/import-approved-knowledge.mts `
  --manifest ..\..\output\freshman-platform\knowledge-manifest.json `
  --approved-root ..\..\output\freshman-platform\approved-knowledge `
  --wait `
  --timeout-minutes 30
Pop-Location
```

同一知识库中的同一 SHA-256 不会重复上传。文件内容变化后，必须更新人工审批时间才
能创建新版本。管理页会显示哈希、适用年份、审批、WeKnora ID、解析状态和错误；
失败条目只能按原清单和原哈希重试。

目前工作区中没有能够明确确认为、且已获得本次导入批准的《2025年新生指南》原始
文件，因此没有替用户复制、编造或导入首批语料。

## 5. 备份与恢复边界

真实栈运行时执行：

```powershell
.\scripts\backup-knowledge-stack.ps1
```

每份备份位于 D 盘时间戳目录，包含：

- `live-in-hdu.sql.gz`
- `weknora.sql.gz`
- `weknora-data-files.tar.gz`
- `approved-knowledge-manifest.json`
- `config.redacted.json`
- `manifest.json`

脚本只在一致性快照期间暂停 WeKnora `app` 与 `docreader`，随后恢复并检查健康；
保留最近 14 份。恢复前先验证 `manifest.json` 中所有 SHA-256，并停止完整栈。

当前尚未执行“新命名测试卷 + 测试端口”的清洁恢复演练。真实数据出现前，不应把
未演练的恢复流程宣称为已验证。演练必须使用新项目名和新卷，不得覆盖原卷，并核对
问题数、回答版本、FIFO 审核顺序、WeKnora 知识数、一次已知检索和 outbox 状态。

## 6. 故障与审核

- 管理页：`http://localhost:3210/admin`，仅本机可访问。
- 解析失败：查看“已审批知识导入”的 `lastError`，确认原清单和文件未改变后重试。
- FAQ 同步失败：查看健康接口中的 `integrationOutbox`，再使用受保护的 retry
  接口重排单条任务。
- WeKnora 不可用：预设问题仍可回答；未知问题仍按 FIFO 入队。
- SearXNG 或 TokenDance 不可用：返回谨慎的非事实性兜底和固定甄别批注，保留
  provider failure，不能伪造搜索成功。
- 业务 PostgreSQL 不可用：第三段请求必须报服务不可用，不能返回未入队的成功。

## 7. 密钥轮换

- TokenDance：更新 `apps/freshman-mvp/.env.local` 的 `TOKENDANCE_API_KEY`，
  只重启网关。
- WeKnora API Key：在 WeKnora 管理端生成新 Key，更新应用环境文件，验证后撤销
  旧 Key。
- 业务数据库：先在 PostgreSQL 内执行角色密码变更，再同步
  `deploy/local/.env.local`，重启并验证；只改 Compose 环境不会修改已有角色。
- WeKnora 数据库、Redis、JWT、SearXNG：先备份，再更新被忽略的
  `vendor/WeKnora/.env`，按组件重建并验证；不得把值写入文档或 Git。

密钥轮换后运行两次密钥扫描和健康检查。

## 8. 将来迁移到腾讯云

迁移边界是运行环境，不重写业务路由：将业务 PostgreSQL、WeKnora、SearXNG 和
网关搬到团队账户下的腾讯云运行时，把 D 盘持久化目录替换为云数据盘/托管数据库，
再配置备案域名、HTTPS、访问控制、备份和监控。TokenDance、WeKnora 与数据库账号
均应由团队账户持有，不能依赖开发者个人电脑。

在仍为本地部署时，电脑必须保持开机、不能休眠，并保持局域网与所需互联网连接。
电脑关机、休眠、断网或服务进程退出后，客户端访问会立即中断；接入 TokenDance
模型不会替代本地服务器。
