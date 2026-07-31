# LIVE IN HDU 当前恢复检查点

更新时间：2026-07-31（Asia/Shanghai）

## 恢复入口

- 工作区：`C:\Users\Star\Desktop\总项目文件\杭电飞书社区`
- 分支：`codex/local-agent-platform`
- 详细状态：[`SESSION_CHECKPOINT_2026-07-28.md`](SESSION_CHECKPOINT_2026-07-28.md)
- 运行根目录：`D:\Star\LIVE_IN_HDU_RUNTIME`
- 当前阶段：Phase A 已验证；Phase B 已完成 D 盘 Docker/Ollama、真实业务
  PostgreSQL、SearXNG 与网关的部分联调，WeKnora 主栈尚未完成。
- 暂停状态：业务容器、Docker Desktop、Ollama 与应用网关均已停止，数据保留。
  端口 `3210`、`5433`、`8080`、`8081`、`8082`、`8888`、`11434`
  已复核为无监听。

重启后先运行：

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
git status --short --branch
git log -3 --oneline
Get-Content .\docs\SESSION_CHECKPOINT_CURRENT.md
```

继续 Phase B 前，先启动 Docker Desktop 与 Ollama，再执行：

```powershell
.\scripts\preflight-phase-b.ps1 `
  -JsonOutput .\output\freshman-platform\phase-b-preflight.json
```

当前预检唯一已知失败为 `embedding-model-missing`。校园网络无法解析
`registry.ollama.ai` 和 Docker Hub 时，只记录失败；不得擅自修改系统
DNS、VPN 或代理，也不得从非官方来源下载模型。

## 已验证基线

- 后端：139 项中 138 通过、1 项真实完整知识栈用例因未显式开启而跳过、0 失败。
- 前端：34/34。
- 真实 PostgreSQL 契约通过。
- 生产构建成功。
- 生命周期脚本可从 D 盘运行根解析 Docker/Ollama CLI。
- 停止脚本不删除容器、卷或 D 盘数据，未执行 `docker compose down -v`。

## 继续时优先顺序

1. 重试官方 `nomic-embed-text:latest` 模型下载并重跑预检。
2. 预检通过后启动固定版本 WeKnora 主栈并完成真实 REST 联调。
3. 配置真实 TokenDance/WeKnora 密钥与两个知识库 ID。
4. 取得明确获批的《2025年新生指南》原文件后再生成审批清单并导入。
5. 完成检索评测、FAQ 同步、备份恢复、两轮完整知识栈测试和实体手机验收。

## 红线

- Q11 保持空白，纯数字 `19` 不得作为答案。
- 未经批准不导入整个 `最新资料`，不自动发布原始回答。
- 不提交 `.env.local`、API Key、数据库密码或连接串。
- 不把用户已有的未跟踪 `config/`、`vendor/`、`最新资料/` 和中文记录文件加入提交。
- 不执行 `docker compose down -v`。
