# LIVE IN HDU Freshman MVP

Vue 3 + Fastify 前端/后端应用，包含 GOAI Agent 垂直切片。

## Agent 路由

- `/agent` — 真实 Agent 工作台（需要后端服务）
- `/goai-demo` — 初赛高保真演示（静态回放，无需后端）

## 环境变量

复制 `.env.example` 为 `.env.local` 并填写：

```dotenv
TOKENDANCE_API_KEY=
```

无密钥时系统仍可运行本地预设和知识库。

## 开发

```powershell
npm install
npm run dev:web    # 仅前端
npm run dev        # 前端 + 后端
```

## 构建

```powershell
npm run build
npm start
```

## 验证

```powershell
npm run verify:goai-agent
```

## 注意

本目录为 GOAI 初赛提交精简版。真实生产系统、用户数据和私有知识库未包含在内。
