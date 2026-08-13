# LIVE IN HDU GOAI Agent

**参赛赛道**：无界应用｜Boundless Agents（初赛）  
**定位**：面向大学生成长目标的可验证 Agent 原型

## 一句话

> 把大学生成长目标推进到可提交：创建任务 → 七步计划 → 工具调用 → 校验修订 → 成果交付 → 等待用户确认。

## 在线体验

- **公开 Demo**：[https://live-in-hdu-goai-agent.vercel.app/goai-demo](https://live-in-hdu-goai-agent.vercel.app/goai-demo)
- **演示模式**：打开链接后自动播放完整链路；也可点击按钮手动推进。

> 注：Demo 为初赛演示回放，基于真实本地执行记录；不代表 GOAI 官网或飞书生产系统已自动完成操作。

## 项目结构

```
apps/freshman-mvp/
├── web/                        # 前端 Vue 应用
│   ├── views/
│   │   ├── AgentDemoView.vue   # 真实 Agent 工作台（/agent）
│   │   └── GoaiDemoView.vue    # 初赛高保真演示（/goai-demo）
│   ├── router.ts               # 路由定义
│   └── api.ts                  # Agent API 类型与客户端
├── src/
│   ├── domain/agent-task.ts    # Agent 任务领域模型
│   ├── repositories/           # 任务持久化（SQLite）
│   └── services/
│       ├── goai-agent-orchestrator.ts  # Agent 编排器
│       └── goai-agent-tools.ts         # 受控工具实现
└── package.json
```

## Agent 链路（真实已实现）

1. 用户以一句目标创建持久任务；
2. Agent 规划并调用受控工具（规则快照、任务规划、简介生成、校验修订、清单创建、成果打包）；
3. 作品简介从 **537 字校验失败** 自动修订为 **492 字通过**；
4. 成果可下载、来源可追溯；
5. GOAI 官网最终提交**等待用户确认**，不自动进行。

## 快速开始

### 环境要求

- Node.js >= 18
- npm >= 9

### 安装

```powershell
cd apps/freshman-mvp
npm install
```

### 运行

```powershell
# 开发模式（前端 + 后端）
npm run dev

# 仅前端
npm run dev:web

# 生产构建
npm run build
npm start
```

### 验证

```powershell
# Agent 专项验证（Node + Web + 类型检查）
npm run verify:goai-agent
```

## 事实分层

- **现有证据**：LIVE IN HDU 校园知识、搜索、来源、审核和运行底座；
- **初赛原型**：GOAI 单场景任务空间、编排、工具、校验和产物；
- **复赛路线**：飞书日历、外部任务系统、第二个大学生成长场景。

## 安全与限制

- 不调用外部模型或 API，断网后核心流程仍可演示；
- 不暴露本地绝对路径、密钥、Cookie、数据库或私人信息；
- Demo 为确定性回放，不代表已接入飞书生产系统；
- 对外发布、GOAI 最终提交都必须停在用户确认门前。

## 依赖许可证

主要开源依赖：

- Vue 3 (MIT)
- Vue Router 4 (MIT)
- Fastify (MIT)
- TypeScript (Apache-2.0)
- Vite (MIT)

完整依赖列表见 `apps/freshman-mvp/package.json`。

## 评审要点

| 维度 | 证明 |
|------|------|
| Agent 能力 | 创建持久任务、七步计划、受控工具调用、失败重试、过期租约接管 |
| 产品体验 | 可交互 Demo（/goai-demo）+ 真实 Agent 工作台（/agent） |
| 技术实现 | Vue 3 + Fastify + SQLite；完整类型覆盖；55+ 后端测试 + 64+ 前端测试 |
| 安全合规 | 无外部 API 依赖；无密钥暴露；Demo 明确标注为回放 |
| 开放复用 | 工具链可扩展；场景可替换；架构支持多任务队列 |

## License

MIT

---

**注意**：本仓库为 LIVE IN HDU GOAI 初赛提交专用。真实生产系统、用户数据和私有知识库未包含在内。
