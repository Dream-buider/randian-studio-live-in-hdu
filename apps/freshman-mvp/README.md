# LIVE IN HDU 本地新生问答平台

这是 Phase A 的可运行单机版：Vue 手机 H5 + Fastify API + SQLite 内容/审核库。无需 Docker，要求 Node.js 24。

## 启动、停止和验证

在仓库根目录运行：

```powershell
.\scripts\start-freshman-platform.ps1
.\scripts\stop-freshman-platform.ps1
.\scripts\test-freshman-platform.ps1
```

启动脚本只在构建缺失或源码更新时重新构建，首次发现数据库没有问题意图时才导入当前飞书表格；重复启动不会重复写入。默认地址：

- 用户端：`http://localhost:3210`
- 本机审核后台：`http://localhost:3210/admin`
- 同一 Wi-Fi 用户端：以启动脚本打印的 `http://局域网IP:3210` 为准

审核后台只允许本机回环地址访问，不提供局域网管理地址。

## 数据和 D 盘边界

代码保留在仓库，容易增长或持续写入的内容均通过 junction 落到 `D:\Star\LIVE_IN_HDU_RUNTIME`：

- `apps/freshman-mvp/runtime` → `D:\Star\LIVE_IN_HDU_RUNTIME\app-runtime`
- `apps/freshman-mvp/dist` → `D:\Star\LIVE_IN_HDU_RUNTIME\dist`
- `apps/freshman-mvp/node_modules` → `D:\Star\LIVE_IN_HDU_RUNTIME\node_modules\freshman-mvp\node_modules`
- `output/freshman-platform` → `D:\Star\LIVE_IN_HDU_RUNTIME\knowledge`
- TEMP、TMP、npm cache、日志、PID、报告、备份和浏览器验收产物也在 D 盘

生产数据库为 `apps/freshman-mvp/runtime/live-in-hdu.db`。当前首次导入基线是 35 个意图、31 条原始回答、0 条自动发布答案；Q11 始终保持空白。原始回答只有经人工审核并在管理页发布新版本后，才会进入用户端预设答案。

## TokenDance 与无密钥行为

复制配置样例，但不要提交或转发真实密钥：

```powershell
Copy-Item .\apps\freshman-mvp\.env.example .\apps\freshman-mvp\.env.local
```

在 `.env.local` 中只填写服务端变量：

```dotenv
TOKENDANCE_API_KEY=你的真实密钥
```

有真实、去除空格后非空的 Key 时，服务端使用 TokenDance 官方入口和 `deepseek-v4-flash`；Key 不会进入前端构建、健康信息或日志。没有 Key 时，健康页明确显示 `model: disabled / no-key`，系统仍会：

1. 匹配已审核发布的预设答案；
2. 查询本地知识条目；
3. 对未知问题返回诚实的非阻塞回答和固定甄别批注，并按 FIFO 写入待审核队列。

Phase A 的独立全网搜索明确为 `unavailable / phase-a-disabled`，不会伪造搜索结果。TokenDance 需要联网；本地预设、知识库、审核和无密钥兜底不依赖外网。

## 备份和恢复

服务运行时可在线备份：

```powershell
npm --prefix apps/freshman-mvp exec -- tsx apps/freshman-mvp/scripts/backup-sqlite.mts --database apps/freshman-mvp/runtime/live-in-hdu.db --output output/freshman-platform/backups --retain 14
```

备份使用 SQLite `VACUUM INTO`，文件名为 UTC 时间，保留最近 14 份并执行完整性检查。恢复前必须先停止服务：

```powershell
.\scripts\stop-freshman-platform.ps1
npm --prefix apps/freshman-mvp exec -- tsx apps/freshman-mvp/scripts/backup-sqlite.mts --database apps/freshman-mvp/runtime/live-in-hdu.db --output output/freshman-platform/backups --restore output/freshman-platform/backups/你的备份.db --pid-file output/freshman-platform/platform.pid.json
```

恢复会拒绝覆盖仍在运行的数据库，先创建安全备份，再迁移并核对完整性和数据计数。

## 运行事实和下一阶段

- 这是本地部署：电脑关机、休眠、断网或进程停止后，客户端无法继续访问。接入 TokenDance 只提供模型能力，不会替你托管本地服务。
- 当前没有公网域名、ICP、HTTPS、管理员登录、限流或微信小程序审核。
- Phase B 才考虑 WeKnora、PostgreSQL、向量检索和经验证的独立全网搜索。
- 已完成 Microsoft Edge 390×844 模拟手机视口与桌面管理页验收；尚未在实体手机上验证，同一 Wi-Fi 真机访问仍需人工补测。
