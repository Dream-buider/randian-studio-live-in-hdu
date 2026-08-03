# LIVE IN HDU 前端阶段性交接

## 当前阶段

- 项目：燃点工作室 · LIVE IN HDU 新生问答助手
- 交付日期：2026-08-03
- 交付协作者：GitHub `ace1230280`
- 分支：`collab/frontend-initial-handoff-20260803`
- 基线：`origin/main` 的 `b5e9011c52a8e01499434eaa1544452ac1140023`
- 当前 commit：交付 commit 创建后，以 Draft PR head 为准
- PR：创建 Draft PR 后在本节补充；当前不会直接合并 main

这一阶段交付的是可继续开发的用户端前端，不是生产环境副本。Owner 继续维护真实后端、数据库、知识库、模型、API、公网入口和最终集成。

## 已完成内容

- 新增手机初始化页 `/`：燃点 Logo、`LIVE IN HDU`、开学倒计时、校园黎明插画、直线流星雨和进入问答按钮。
- 倒计时目标为北京时间 `2026-09-16 00:00:00`，精确到秒，到点后归零并显示“开学啦”。
- 原问题卡页面移动到 `/questions`，保留问题翻页、目录跳转、左右滑动、完整回答展开、来源与更新时间。
- 保留 `/guide` 新生指北、`/chat` 问答结果页和提问弹层。
- 新增默认关闭的 `ui-preview` 模式，用 5 条明确标注为模拟内容的问题进行无后端 UI 预览。
- 新增 WebGL 流星雨组件，支持减少动态效果、页面隐藏暂停、失败静态降级和组件卸载清理。
- 保留本地 `/admin`，但没有修改管理页面设计或业务；`public-trial` 构建继续排除管理端。
- 增加初始化页、倒计时、流星生命周期、Mock 边界、正式 API 边界和公开体验路由测试。
- 正式构建与公开体验构建新增自动门禁，若打包产物意外包含 UI Preview 模拟问答会直接失败。

## 文件导航

建议下一位前端协作者依次阅读：

1. `PRODUCT.md`：用户、手机范围、产品边界和证据原则。
2. `DESIGN.md`：颜色、字体、组件、断点、动效和 Student/Admin 边界。
3. `apps/freshman-mvp/web/router.ts`：用户端和本地管理端路由。
4. `apps/freshman-mvp/web/views/WelcomeView.vue`：初始化页结构和样式。
5. `apps/freshman-mvp/web/components/ArrivalLightfall.vue`：OGL 流星雨。
6. `apps/freshman-mvp/web/countdown.ts`：倒计时计算。
7. `apps/freshman-mvp/web/views/QuestionDeckView.vue`：问题卡交互。
8. `apps/freshman-mvp/web/components/AskSheet.vue`：提问弹层和移动端输入。
9. `apps/freshman-mvp/web/components/use-dialog-focus.ts`：焦点进入、循环和恢复。
10. `apps/freshman-mvp/web/components/use-visual-viewport.ts`：软键盘和 Visual Viewport。
11. `apps/freshman-mvp/web/api.ts`：真实 API 类型、校验和 Mock 选择边界。
12. `apps/freshman-mvp/web/mock/questions.ts`：仅用于 UI Preview 的 5 条模拟数据。
13. `apps/freshman-mvp/web/styles/tokens.css`：学生端、弹层与既有管理端公共样式。
14. `apps/freshman-mvp/test/web/`：前端行为和安全边界证据。

## 本地运行

要求 Node.js 24.x。先确认环境：

```powershell
node --version
npm --version
```

安装锁定依赖：

```powershell
npm --prefix apps/freshman-mvp ci
```

只做前端设计、电脑上没有 Owner 后端时：

```powershell
npm run dev:ui
```

通常打开 `http://127.0.0.1:5173/`。这个模式只提供 5 条模拟问题，不会写数据库，也不会模拟生产发布。

连接 Owner 本机 3210 后端时：

```powershell
npm run dev:web
```

Vite 仍把真实 `/api` 请求代理到 `http://localhost:3210`。

验证命令：

```powershell
npm run test:web
npm run build
npm --prefix apps/freshman-mvp run build:trial
git diff --check
```

完整后端测试可能依赖 Owner 的数据库、Docker、D 盘 junction 和私密配置。前端协作者不要为了运行它复制生产密钥或生产数据。

## 页面与组件结构

| 路径 | 页面 | 主要职责 |
| --- | --- | --- |
| `/` | `WelcomeView.vue` | 初始化场景、倒计时、进入问题卡 |
| `/questions` | `QuestionDeckView.vue` | 问题卡、目录、翻页、滑动、提问入口 |
| `/guide` | `GuideView.vue` | 四类新生指北入口与非官方声明 |
| `/chat` | `ChatView.vue` | 回答状态、来源、联网甄别批注、重试 |
| `/admin` | `AdminView.vue` | Owner 的本地管理端；本阶段不设计、不向 public-trial 暴露 |

核心交互约束：

- 当前问题使用 ID 写入 `localStorage`，不能改成依赖数组位置。
- 左右滑动阈值为 50px，并在首尾禁止越界。
- 问题目录和提问弹层必须把焦点移入、循环 Tab、支持 Escape，并在关闭后恢复打开按钮焦点。
- 提问弹层使用 Visual Viewport 处理手机软键盘高度和偏移。
- chat 请求 ID 和 session 状态用于防止刷新后重复 POST 或旧响应覆盖新问题。
- 来源 URL 只允许安全的 HTTP/HTTPS 链接，其他内容作为文本显示。
- 回答和来源标题按纯文本渲染，不能使用 `v-html`。

## 设计规范

- 品牌名称：`LIVE IN HDU`；Logo 位于 `apps/freshman-mvp/web/public/brand/randian-studio-logo.png`。
- 初始化页主色是深杭电蓝，倒计时数字和唯一 CTA 使用珊瑚色。
- 校园黎明图位于 `web/public/brand/campus-dawn-welcome.webp`，它是氛围插画，不是校园实拍或校方证据。
- 初始化页显示字体位于 `web/public/fonts/hdu-arrival-display.woff2`，必须连同 OFL 许可证分发。
- 用户端主要适配 360–430px，重点检查 375px 和 390px，最低支持 320px。
- 桌面端只居中显示手机画布，不建立第二套学生端信息架构。
- 触控目标不小于 44px，保留三像素可见焦点和 `prefers-reduced-motion`。
- 初始化页的珊瑚 CTA、插画、字体、倒计时卡和流星雨不得带进管理端。
- 当前流星方案是 12 条近似平行的直线流星雨；圆弧方案已经废弃。

## API 与后端边界

Owner 维护真实 3210 后端。当前前端依赖：

- `GET /api/questions`
- `POST /api/ask`
- 本地管理端使用的 `/api/admin/*`、`/api/reviews*` 和 `/api/health`

`apps/freshman-mvp/web/api.ts` 中的 `AnswerResult`、`PublishedQuestion`、`SourceRef` 和运行时校验属于前后端契约，不是普通 UI 文案。未经 Owner 同意不得改变请求路径、字段、甄别批注或校验规则。

本阶段对 `web/api.ts` 的改动只是在编译模式为 `ui-preview` 时返回克隆的模拟问题；默认开发和正式构建仍请求 `/api/questions`。正式 API 失败时不会静默回退到 Mock。

不要复制或索取数据库、知识库、API Key、Cookie、访问码、模型密钥和 `.env.local`。API 变更必须先向 Owner 提交接口变更申请。

## 零后端影响

本轮候选提交不得包含：

- `apps/freshman-mvp/src/**`
- `deploy/**`
- `scripts/**`
- 数据、迁移、数据库、日志、PID、`output/`、`runtime/`、`dist/` 或 `node_modules/`

静态检查和前端自动化只能证明候选 diff 没有触碰这些边界。真实 3210 后端、正式数据和公网入口仍需要 Owner 复验。

## 测试状态

迁移前，官方 `origin/main` 基线已使用 Node.js `v24.18.1` 验证：

- `npm run test:web`：3 个文件、44/44 通过。
- `npm run build`：通过。
- `npm --prefix apps/freshman-mvp run build:trial`：通过，管理端隔离断言通过。

迁移后已使用 Node.js `v24.18.1` 完成验证：

- `npm --prefix apps/freshman-mvp ci`：成功；锁文件一致。
- `npm run test:web`：7 个文件、65/65 通过。
- `npm run build`：通过；正式产物不包含 UI Preview 模拟问答。
- `npm --prefix apps/freshman-mvp run build:trial`：通过；管理端隔离断言与 Mock 隔离断言均通过。
- 390×844 手机视口：倒计时逐秒变化、流星动画变化、入口跳转、回答展开和 5 题翻页均通过；浏览器控制台无 warning/error。
- 1440×900 桌面容器：手机画布居中显示，不扩展为第二套桌面信息架构。

依赖安装报告 4 个 audit 项（2 moderate、2 high），本次前端交付不执行破坏性 `npm audit fix --force`。

## 验收截图

- [390×844 初始化页](screenshots/frontend-handoff-mobile-welcome.png)
- [390×844 五问卡片页](screenshots/frontend-handoff-mobile-questions.png)
- [1440×900 桌面容器中的手机画布](screenshots/frontend-handoff-desktop-container.png)

## 已知问题与未完成项

- 桌面模拟视口可以覆盖主要布局，但真实 iPhone/Android 微信软键盘验收尚未完成。
- UI Preview 的 5 条问题是设计数据，不是正式校方内容。
- 校园黎明图是生成/设计插画，不能冒充真实校园摄影。
- 真实后端、数据库、知识库、模型和公网入口由 Owner 复验。
- GitHub CLI 当前未安装；本次使用本地 Git 推送和已连接 GitHub App 创建 Draft PR。
- 当前电脑的安全层会隔离官方 `scripts/start-freshman-mvp.ps1`；本轮不修改该脚本，提交树继续引用 `origin/main` 原始版本。

## 下一位协作者操作

Owner 合并当前 Draft PR 后，下一位协作者应从最新 main 开始：

```powershell
git switch main
git pull --ff-only
git switch -c collab/frontend-next-stage
```

如果 Owner 尚未合并，而下一位协作者必须提前开始，可临时使用堆叠开发：

```powershell
git fetch origin
git switch -c collab/frontend-next-stage origin/collab/frontend-initial-handoff-20260803
```

这是 stacked development 临时方式。当前 PR 合并后，新分支仍需要基于最新 `origin/main` 重新整理，并重新运行前端测试和两种构建。

下一阶段优先做真机微信键盘验收、问题卡和聊天页视觉优化；不要重复制作初始化页基础结构，也不要修改 Owner 的后端和管理端业务。
