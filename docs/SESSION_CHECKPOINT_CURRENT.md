# LIVE IN HDU 当前恢复检查点

更新时间：2026-08-02 07:33:13 +08:00（Asia/Shanghai）

## 当前结论

- 反馈优化版本已经在隔离工作树完成：加入燃点工作室 Logo 与品牌头部、新生指北入口和
  四节目录、可点击的类型化参考来源、移动端提问面板适配、杭电优先联网检索、基于知识
  片段的杭电语境回答，以及管理端知识来源和“杭电资料不足”提示。
- 用户批准的《杭电新生指北》已从 D 盘审批快照导入 WeKnora，状态为 `completed`；
  没有把飞书导航、评论或未经批准资料混入知识库。
- 本地完整服务和团队公网测试版均在运行。公网仅开放用户页面和问答接口，管理端、审核
  队列与健康接口继续返回 404。
- 当前人工审核队列为 19 条，服务端 FIFO 序号为 1 至 19；本轮验收没有修改任何已有
  人工审核决定。Q11 仍保持空白。

## 代码与运行位置

- 主工作区：`C:\Users\Star\Desktop\总项目文件\杭电飞书社区`
- 本轮隔离工作树：
  `C:\Users\Star\Desktop\总项目文件\杭电飞书社区\.worktrees\live-in-hdu-feedback`
- 分支：`codex/live-in-hdu-feedback`
- 写入本检查点前的实现 HEAD：
  `def0076003e5f943a45833dc510bd09a7ea27fc4`
- 运行根目录：`D:\Star\LIVE_IN_HDU_RUNTIME`
- 验收截图目录：
  `D:\Star\LIVE_IN_HDU_RUNTIME\acceptance\2026-08-02-feedback-optimization`
- D 盘审批资料目录：`D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge`

当前入口：

- 本地用户端：`http://127.0.0.1:3210/`
- 本地新生指北：`http://127.0.0.1:3210/guide`
- 本地审核后台：`http://127.0.0.1:3210/admin`
- 团队公网测试版：`https://38a2f881.r6.cpolar.cn`
- WeKnora 管理端：`http://127.0.0.1:8081/`
- SearXNG：`http://127.0.0.1:8888/`

2026-08-02 07:33 观察到的进程：

- 私有网关 3210：PID 9224，命令行指向当前隔离工作树的 `dist/server/index.js`。
- 公网测试网关 3211：PID 41876，命令行指向当前隔离工作树的
  `dist/public-trial/index.js`。
- cpolar 本机管理端 4040：PID 53016。PID 会在重启后变化，恢复时以端口和入口文件
  所有权校验为准，不要依赖这里的旧 PID 强制结束进程。

## 知识导入审计

- 标题：`杭电新生指北`
- 版本：1
- 来源类型：`community`
- 原始来源：
  `https://rcncolp2ehkb.feishu.cn/wiki/J7o6wBiJVi36wJk2VSTcyyb1nDd`
- 资料日期：`2026-07-30`
- 审批人：`project-owner`
- 导入方式：`manual`
- WeKnora 解析状态：`completed`
- 内容 SHA-256：
  `1aacf02cf6d9527fdf75996d7bbd49d4840ae08f0fd28e49d058f68f408769b0`
- D 盘快照：
  `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\hdu-freshman-guide-2026.md`
- D 盘清单：
  `D:\Star\LIVE_IN_HDU_RUNTIME\approved-knowledge\knowledge-manifest.json`

快照和清单不进入 Git。更新时必须先重新导出、人工对比和批准，再 dry-run、导入、等待
解析完成，并执行第二次幂等导入检查。

## 自动化与构建验证

在实现 HEAD `def0076003e5f943a45833dc510bd09a7ea27fc4` 上最后一次完整运行：

- 后端：187 项，185 通过、2 项明确要求实时环境的测试跳过、0 失败。
- 前端：3 个测试文件，44/44 通过。
- `npm run build`：通过。
- `npm run build:trial`：通过，public-trial 构建断言通过。
- 本地首页：200；哈希脚本 `/assets/index-C2SQEPa9.js`：200，115771 bytes。
- `/api/health`：gateway/database 正常，WeKnora available，TokenDance、SearXNG 已配置，
  FAQ outbox 0 待处理、0 失败。

公网测试脚本已经补充 `/guide` 检查，并实际验证：

- 未登录首页：302。
- 登录：首页 200、`/guide` 200、`/chat` 200、`/api/questions` 200、
  `/api/ask` 200。
- 隔离：`/admin`、`/api/admin/intents`、`/api/reviews`、`/api/health`
  均为 404。
- `/guide/admin` 仍为 404；GET/HEAD `/guide` 只返回用户端 SPA，不扩大管理路径白名单。

## 浏览器与移动端验收

- Kimi WebBridge 健康检查为 `running: true`、`extension_connected: true`；真实浏览器已验证
  首页、四节指北、提问、带来源的回答、管理端导入来源和“杭电资料不足”。
- 由于 D 盘 npm 缓存没有 `@playwright/cli`，外网 registry DNS 又返回 `ENOTFOUND`，
  Playwright CLI 本轮不可用。没有联网安装大依赖，也没有在仓库创建 Playwright spec。
- 受限替代验收复用了本机已有 Playwright Core 1.62.0-alpha 和系统 Chrome；临时目录及
  所有截图均在 D 盘。
- 375×667，模拟 visual viewport 高度 360：textarea 底部 324.59，发送按钮底部 338，
  均处于可视区内。
- 390×844，模拟 visual viewport 高度 480：textarea 底部 381.66，发送按钮底部 458，
  均处于可视区内。
- 两种视口均验证 Logo、燃点工作室、新生指北入口、四个目录卡、四个飞书深链、来源标签
  与链接、导入来源和 13 条“杭电资料不足”样例。
- 验收目录中共有 20 张 PNG，包括 Kimi 的 6 张功能截图和精确视口的 14 张截图。
- **微信键盘实机验收待完成**：本轮没有可操作的 iPhone 与 Android 微信设备，不能把
  浏览器模拟说成微信真机通过。

## 安全启动与停止摘要

本轮所有增长数据、构建产物、日志、截图、npm 缓存和数据库均放在 D 盘。被 Git 忽略的
`.env.local` 仍只保存在主工作区，不得复制进文档或提交。合并分支后，从主工作区运行：

```powershell
Set-Location 'C:\Users\Star\Desktop\总项目文件\杭电飞书社区'
.\scripts\start-knowledge-stack.ps1
.\scripts\start-public-trial.ps1 -StartTunnel `
  -KnownPublicUrl 'https://38a2f881.r6.cpolar.cn'
```

只停止公网测试版，保留本地完整服务：

```powershell
.\scripts\stop-public-trial.ps1
```

安全停止全部项目服务：

```powershell
.\scripts\stop-knowledge-stack.ps1
```

停止脚本只停止受所有权校验保护的进程和容器，不删除数据库、容器卷或 D 盘资料。禁止
执行 `docker compose down -v`，不要手工结束未验证命令行所有权的 PID。

本地电脑仍是服务器：电脑关机、休眠、Docker/Ollama 或本机代理停止、网络中断后，
本地和公网测试版都会中断；TokenDance 模型不能代替本机网关和知识库。

## 剩余工作

1. 由 controller 对本轮完整分支做最终代码审查，再决定合并回主工作区。
2. 使用至少一台 iPhone 和一台 Android，在微信内完成键盘弹出、连续多行输入、收起与
   再弹出、滚动和提交的实机验收；完成前保持“微信键盘实机验收待完成”。
3. 按 FIFO 审核当前 19 条待审核问题，只有人工确认后才回流知识库；不要自动发布。
4. 交付长期使用前迁移到团队云服务器，并另行处理域名、备案、HTTPS、备份和费用。

## 红线

- Q11 保持空白，纯数字 `19` 不得作为答案。
- 未经批准不导入整个 `最新资料`，不自动发布原始回答。
- 不提交 `.env.local`、API Key、Cookie、团队测试码、数据库密码或连接串。
- 不把用户已有的 `config/`、`vendor/`、`最新资料/`、`LIVE_IN_HDU_搭建记录.txt`、
  `杭电飞书校园社区搭建方案.txt` 加入提交。
- 不执行 `docker compose down -v`。
