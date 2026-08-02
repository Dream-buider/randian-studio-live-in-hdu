# 燃点工作室 · LIVE IN HDU 新生问答助手

面向杭州电子科技大学新生的移动端问答与校园指北项目。项目将高频预设问答、知识库检索、联网兜底和人工审核队列组合为一条可维护的回答链路。

## 功能

- 移动端常见问题卡片与完整答案
- 自然语言意图识别，支持同义改写
- `预设答案 → 知识库 → 联网检索` 三级路由
- 回答来源、资料日期和可信状态展示
- 未收录问题即时回答并进入 FIFO 人工审核队列
- 新生指北导航、燃点工作室品牌页头
- 本地管理端、发布版本和知识导入审计
- 受限公网体验网关，管理接口默认不对公网开放

## 技术栈

- Vue 3 + Vite + TypeScript
- Fastify
- PostgreSQL / SQLite
- WeKnora + Ollama Embedding
- SearXNG
- OpenAI 兼容模型接口（密钥由部署者自行配置）

## 安全说明

仓库不包含任何真实 API Key、数据库密码、Cookie、访问码、数据库文件、模型、日志或本机运行数据。所有真实配置必须从示例文件复制到被 Git 忽略的 `.env.local`，禁止提交。

## 快速验证

要求 Node.js 24。

```powershell
npm --prefix apps/freshman-mvp ci
npm run test:web
npm run build
```

前端开发服务器：

```powershell
npm run dev:web
```

根目录的 `npm ci` 只在需要 Playwright 浏览器验收工具时执行。依赖 D 盘 junction、Docker 或真实知识栈的完整后端验收属于部署侧测试，请按本地运行手册准备环境后再运行 `npm run test:all`。

开发服务器默认把 `/api` 代理到 `http://localhost:3210`。如果只做 UI 协作且不部署后端，请阅读 [老板 / Codex 交接提示词](docs/BOSS_CODEX_HANDOFF_PROMPT.md)，先建立默认关闭的 Mock 预览模式。

## 完整本地环境

完整知识栈涉及 PostgreSQL、WeKnora、Ollama 和 SearXNG。请先阅读：

- [本地运行手册](docs/PHASE_B_LOCAL_RUNBOOK.md)
- [知识运营说明](docs/PHASE_B_KNOWLEDGE_OPERATIONS.md)
- [部署配置模板](deploy/local/.env.example)
- [WeKnora 上游与许可证边界](docs/WEKNORA_UPSTREAM_BASELINE.md)

Windows 启停入口位于 `scripts/`。脚本不会替你托管服务；本机关闭、休眠或断网后，本机服务将中断。禁止执行 `docker compose down -v`。

## 目录

```text
apps/freshman-mvp/   前后端源码、测试和前端资源
deploy/local/        本地知识栈与空白配置模板
docs/                架构、实施计划和交接文档
scripts/             安全启停、测试、备份和导入脚本
```

## 协作

1. 从 `main` 创建功能分支。
2. 修改前先阅读相关测试和文档。
3. 至少运行 `npm run test:web` 与 `npm run build`。
4. 通过 Pull Request 合并，不要把密钥或运行数据写入提交。

核心审核规则：Q11 保持空白；未审核内容不得自动发布；联网兜底答案必须保留甄别批注；管理端不得通过公网体验网关暴露。

## 许可证

本项目自有代码使用 [MIT License](LICENSE)。第三方组件继续适用其各自许可证，详见对应上游项目和仓库内说明。
