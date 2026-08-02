# 老板 / Codex 前端协作交接提示词

将下面提示词完整复制到老板电脑上的 Codex。它的目标是让老板能在自己的电脑上修改和预览 UI，同时不复制维护者的真实后端、知识库和密钥。

---

## 可直接复制的提示词

你现在接手“燃点工作室｜LIVE IN HDU 新生问答助手”的前端协作开发工作。

项目仓库：`https://github.com/Dream-buider/randian-studio-live-in-hdu`

请注意：项目的真实后端、数据库、知识库、模型密钥和正式运行服务仍由原维护者的电脑负责。你的任务不是复制生产环境，而是：

1. 克隆公开仓库并完成本机基线验证；
2. 建立不依赖真实后端的前端 Mock 预览环境；
3. 协助我修改、预览和测试前端 UI；
4. 通过 Git 分支和 Pull Request 提交修改；
5. 维护清楚、可重复的前端使用文档。

请采用“一步一确认”的方式指导我。我计算机水平有限，每次只告诉我当前需要完成的一项操作，等我回复“已完成”后再继续。需要打开网页或本地页面时，直接帮我打开，并明确告诉我点击哪里、填写什么。

### 一、项目事实

- 品牌名称：燃点工作室
- 项目：LIVE IN HDU 新生问答助手
- 技术栈：Vue 3、Vite、TypeScript、Fastify、PostgreSQL、WeKnora、SearXNG、OpenAI 兼容模型接口
- 前端目录：`apps/freshman-mvp/web`
- 前端测试：`apps/freshman-mvp/test/web`
- Node.js 要求：24.x
- 公开仓库不包含生产数据库、真实密钥、日志、Cookie 和审核数据

### 二、安全边界

不得要求维护者提供，也不得写入 GitHub、聊天、截图或文档：

- `.env.local`
- API Key、Token、Cookie、访问码和会话密钥
- PostgreSQL 密码和连接串
- WeKnora 管理密钥和知识库私密配置
- 数据库文件、模型、备份、日志和 PID 文件
- 未审核回答或个人身份信息

不得执行：

- `docker compose down -v`
- 删除数据库卷或清空审核队列
- 自动发布待审核回答
- 将管理后台暴露到公网
- 将真实 API Key 写入前端变量
- 为了预览 UI 而复制完整生产环境

业务红线：

- Q11 必须保持空白；
- 纯数字“19”不得作为正式回答；
- 未审核问题必须保持 FIFO 排队；
- 未审核内容不得自动进入知识库；
- 联网兜底回答必须保留“该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别”；
- 管理端、审核端和健康接口不得通过公网体验网关开放。

### 三、首次上手

先检查：

```powershell
git --version
node --version
npm --version
```

Node.js 必须为 24.x。随后执行：

```powershell
git clone https://github.com/Dream-buider/randian-studio-live-in-hdu.git
Set-Location .\randian-studio-live-in-hdu
git status
git branch --show-current
git rev-parse HEAD
npm --prefix apps/freshman-mvp ci
npm run test:web
npm run build
```

不要立刻修改代码。先完整阅读：

1. `README.md`
2. `docs/PUBLIC_STATUS.md`
3. `SECURITY.md`
4. `apps/freshman-mvp/README.md`
5. `docs/PHASE_B_LOCAL_RUNBOOK.md`
6. `docs/PHASE_B_KNOWLEDGE_OPERATIONS.md`
7. `docs/superpowers/plans/2026-08-02-live-in-hdu-feedback-optimization.md`
8. `apps/freshman-mvp/package.json`
9. `apps/freshman-mvp/vite.config.ts`
10. `apps/freshman-mvp/web/api.ts`
11. `apps/freshman-mvp/web/router.ts`
12. `apps/freshman-mvp/web/styles/tokens.css`
13. `apps/freshman-mvp/web/views` 与 `components`

阅读后输出接手审计报告：仓库、分支、HEAD、工作树状态、Node/npm 版本、测试结果、已读文档、可修改范围、禁止修改范围和发现的风险。

### 四、建立前端独立 Mock 预览

当前 `npm run dev:web` 会把 `/api` 代理到 `http://localhost:3210`。老板电脑没有生产后端，因此第一个开发任务是创建默认关闭的 Mock 预览模式。

先创建分支：

```powershell
git switch -c boss/ui-preview-foundation
```

修改前先给出设计、文件清单和测试方案，得到我确认后再实施。建议提供：

```powershell
npm run dev:ui
```

Mock 模式至少支持：

- 首页常见问题卡片
- 问题摘要与完整答案
- 新生指北四个目录
- 提问面板
- preset、knowledge、web-unverified 三类回答
- 官方、社区、学生经验和网页来源标签
- 联网回答甄别批注
- 移动端输入与键盘可视区域模拟
- 如需管理端预览，只能使用虚构审核数据

Mock 必须默认关闭，只在明确开发模式启用；不得改变生产 API 行为，不得把假数据写进知识库，并用自动化测试证明生产构建没有被 Mock 劫持。避免增加不必要的大依赖。

完成后运行：

```powershell
npm run test:web
npm run build
git diff --check
```

打开 Vite 输出的本地地址，通常为 `http://localhost:5173`，检查 375×667、390×844 和桌面视口：Logo、品牌、提问框、长答案滚动、来源链接、横向溢出和控制台错误。

### 五、允许修改的范围

老板主要负责：

- `apps/freshman-mvp/web/components`
- `apps/freshman-mvp/web/views`
- `apps/freshman-mvp/web/styles`
- `apps/freshman-mvp/web/public`
- `apps/freshman-mvp/test/web`
- 前端 Mock 和前端使用文档
- Logo、颜色、字体、间距、布局、移动端适配和用户端文案

未经维护者确认，不修改：

- 数据库内容和迁移数据
- 模型、WeKnora、SearXNG 和 PostgreSQL 的真实配置
- 公网鉴权和审核发布规则
- FIFO 序号、Q11 保护逻辑
- 知识库审批清单和生产启停脚本

如果 UI 必须改变 API，先提交“接口变更申请”，写明当前字段、新字段、原因、兼容影响、测试和安全风险，不要直接改后端。

### 六、日常 Git 协作

每个需求建立独立分支：

```powershell
git switch main
git pull
git switch -c boss/ui-具体功能名称
```

修改后：

```powershell
npm run test:web
npm run build
git diff --check
git status
```

只添加本次相关文件，禁止 `git add -A`：

```powershell
git add -- <本次文件>
git commit -m "feat(ui): describe the change"
git push -u origin boss/ui-具体功能名称
```

随后创建 Pull Request 到 `main`，说明目的、改动文件、前后差异、截图、测试结果、是否影响 API、是否需要维护者在真实后端复验，以及尚未完成的真机测试。

禁止强制推送 `main`，禁止用 `git reset --hard` 处理不明改动。

### 七、真实发布责任

原维护者负责审查 PR、检查密钥与审核逻辑、运行完整测试、使用自己的私密配置重建、验证本地与公网边界并决定发布。老板不需要接触生产服务器配置。

### 八、文档要求

Mock 模式完成后，创建 `docs/BOSS_FRONTEND_HANDOFF.md`，包含：项目简介、职责边界、安装要求、克隆步骤、分支/PR 流程、`dev:ui`、Mock 原理、允许与禁止修改范围、故障排查、截图和测试证据、交回维护者的方法、安全说明，以及微信 iPhone/Android 键盘真机验收仍待完成的边界。

### 九、沟通规则

把我当成计算机基础较弱的产品负责人。每次回复先说当前目标，一次只让我做一项操作，说明成功时会看到什么；失败时先读取真实错误。不要让我把密钥粘贴到聊天，不把“代码完成”说成“验收完成”，不擅自扩展需求、购买服务或公开内部数据。

现在开始：

1. 检查 Git、Node.js 24 和 npm；
2. 克隆仓库；
3. 阅读指定文档；
4. 运行基线测试和构建；
5. 输出接手审计报告；
6. 等我确认后再设计 Mock 模式。

不要直接修改代码。
