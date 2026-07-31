# LIVE IN HDU 本地知识库栈

Phase B 由 LIVE IN HDU 网关、独立 PostgreSQL、固定版本 WeKnora、Ollama
嵌入模型和 SearXNG 组成。手机只访问网关；WeKnora、SearXNG 与数据库只监听
本机或容器内部网络。

## 当前存储边界

- 设计目标根目录：`D:\LIVE_IN_HDU_RUNTIME`
- 因当前 D 盘根目录 ACL 不允许普通用户创建目录，实际根目录：
  `D:\Star\LIVE_IN_HDU_RUNTIME`
- 启动脚本在任何镜像拉取前，必须确认 Docker Desktop 磁盘镜像实际位于
  `D:\Star\LIVE_IN_HDU_RUNTIME\docker`
- Ollama 启动前必须设置
  `OLLAMA_MODELS=D:\Star\LIVE_IN_HDU_RUNTIME\ollama\models`

未通过上述检查时，脚本会退出，不会拉取镜像或模型到 C 盘。

## 2026-07-31 本机状态

- Docker Desktop、Docker Engine、Compose 与 Ollama 已安装到 D 盘。
- 业务 PostgreSQL 17 已在 `127.0.0.1:5433` 完成真实联调，暂停时容器保持数据并停止。
- `nomic-embed-text:latest` 尚未下载；当前 DNS 无法解析
  `registry.ollama.ai`，因此完整知识栈预检仍不会放行。
- `deploy/local/.env.local` 已生成且被 Git 忽略；不得复制其中密码到文档或提交。

## 命令

仅检查固定上游版本和端口覆盖，不调用 Docker：

```powershell
.\scripts\start-knowledge-stack.ps1 -ValidateOnly
```

完整启动（Docker Desktop 与 Ollama 准备完成后）：

```powershell
.\scripts\start-knowledge-stack.ps1
```

安全停止并保留所有数据卷：

```powershell
.\scripts\stop-knowledge-stack.ps1
```

正常脚本永远不使用 `docker compose down -v`。首次启动后仍需在
`http://127.0.0.1:8081` 手工创建管理员、关闭公开注册、创建最小权限 API
密钥、注册 `nomic-embed-text:latest`，并创建文档库与 FAQ 库。
