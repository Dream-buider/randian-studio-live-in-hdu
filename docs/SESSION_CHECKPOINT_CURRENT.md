# LIVE IN HDU 当前恢复检查点

更新时间：2026-07-31（Asia/Shanghai）

## 当前结论

- 本地技术链路已经完成并通过验证：手机 H5 / 管理端、Fastify 网关、业务
  PostgreSQL、WeKnora、Ollama 嵌入模型、SearXNG 与 TokenDance DeepSeek V4 Flash
  均已接通。
- 这只是“本地可运行的技术成品”。内容发布仍处于人工审核前：35 个问题意图中，
  23 个问题已有至少一条原始回答、12 个问题尚无回答，共 31 条原始回答；当前
  0 条标准答案被发布，因此用户端问题卡片暂时为空。
- Q11 仍严格保持 0 条原始回答、0 条发布回答；没有自动导入整个 `最新资料`，也
  没有把未经审核的团队回答发布给用户。
- 当前待审核队列为 0。未知问题在管理员离线时仍会先即时回复，再按服务器顺序写入
  FIFO 队列。

## 恢复入口

- 工作区：`C:\Users\Star\Desktop\总项目文件\杭电飞书社区`
- 分支：`codex/local-agent-platform`
- 运行根目录：`D:\Star\LIVE_IN_HDU_RUNTIME`
- D 盘本轮剩余空间：约 266.54 GB。

当前本机入口：

- 用户端：`http://127.0.0.1:3210/`
- 审核后台：`http://127.0.0.1:3210/admin`
- WeKnora 管理端：`http://127.0.0.1:8081/`
- WeKnora API 健康检查：`http://127.0.0.1:8080/health`
- SearXNG：`http://127.0.0.1:8888/`

当前知识库：

- `LIVE IN HDU 新生资料库`：文档型 RAG 知识库。
- `LIVE IN HDU 新生问答库`：FAQ 知识库，采用“标准问 + 答案”和相似问分别索引。
- 应用使用仅有“检索知识库”能力、且只覆盖上述两个知识库的最小权限 API Key。

## 重启与停止

电脑重启后，先打开 Docker Desktop、Ollama 和本机网络代理，再运行：

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
.\scripts\start-knowledge-stack.ps1
```

安全停止全部项目服务：

```powershell
.\scripts\stop-knowledge-stack.ps1
```

停止脚本只停止进程和容器，不删除数据库、容器卷或 D 盘文件。禁止执行
`docker compose down -v`。

本地电脑就是当前服务器，所以电脑关机、休眠、Docker/Ollama 停止或断网后，客户端
访问都会中断。TokenDance 只提供远程模型能力，不能代替本机服务器。当前 Node 到
TokenDance 依赖本机 `127.0.0.1:11305` 代理；若代理软件更换端口，需要同步更新被
Git 忽略的 `apps/freshman-mvp/.env.local`，不得把密钥写入文档或提交。

## 当前运行状态

2026-07-31 最后复核：

- 网关健康，业务数据库模式为 `postgres`。
- WeKnora app、DocReader 与 PostgreSQL 健康，管理端可访问。
- `nomic-embed-text:latest` 已安装到 D 盘 Ollama 模型目录并被 WeKnora 使用。
- WeKnora 检索状态为 `available`，SearXNG JSON 搜索返回 200。
- 用户端、审核后台、WeKnora API、WeKnora 管理端与 SearXNG 五个入口均返回 200。
- TokenDance 在本轮重启前已完成真实生成验证；重启后健康页的“最近调用”会恢复为
  `never`，直到产生下一次真实模型请求，这不表示密钥丢失。

## 已验证基线

- 后端：147 项，145 通过、2 项显式实时环境用例跳过、0 失败。
- 前端：34/34 通过。
- 旧 MVP：29/29 通过。
- 生产构建成功，密钥扫描通过。
- TokenDance 已真实返回模型生成答案；Node 24 使用环境代理后调用成功。
- WeKnora API Key 已成功列出两个限定知识库，知识库 ID 已写入被忽略的本地环境文件。
- 一次真实三段路由验证得到 `web` / `web-unverified`，返回精确批注：
  `该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`。

## 下一步

1. 已生成23道已审核回答的XLSX发布包与API就绪JSON；下一步在审核后台发布，Q11继续留空。
2. 内容审核通过后再同步到 `LIVE IN HDU 新生问答库`，届时首页问题卡片才会出现。
3. 只把明确获批的《2025年新生指南》及后续资料加入审批清单，再导入资料库。
4. 导入真实语料后执行 20 问检索评测与 WeKnora 完整备份恢复演练。
5. 本机验收完成后，再做同一 Wi-Fi 的实体手机测试；公网访问与长期运行需迁移到团队
   云服务器，另行处理域名、备案、HTTPS 与访问控制。

## 红线

- Q11 保持空白，纯数字 `19` 不得作为答案。
- 未经批准不导入整个 `最新资料`，不自动发布原始回答。
- 不提交 `.env.local`、API Key、数据库密码或连接串。
- 不把用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件加入提交。
- 不执行 `docker compose down -v`。
