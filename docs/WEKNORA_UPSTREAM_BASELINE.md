# WeKnora 上游复用基线

日期：2026-07-21

## 固定来源

- 上游项目：`Tencent/WeKnora`
- 上游地址：https://github.com/Tencent/WeKnora
- 固定提交：`150c07368b84b4f50421b8957255213cbbadc175`
- 本地源码：`vendor/WeKnora/`
- 许可证：项目主体为 MIT，第三方组件依各自许可证；复制、修改和发布时保留 `vendor/WeKnora/LICENSE`。

本地目录来自 GitHub 官方 API 在上述提交生成的源码归档，不跟随上游 `main` 自动更新。后续升级必须先比较迁移、接口和安全变化，再手工替换固定提交。

本地兼容差异：新增 `tests/miniprogram/package.json`，仅把上游 CommonJS 小程序测试隔离于父项目的 ESM 作用域；未修改上游小程序业务代码。

## 可直接复用

| 本项目需求 | WeKnora 能力 | 复用位置 |
| --- | --- | --- |
| 40 个预设问题 | FAQ 知识库、FAQ 搜索与批量导入 | `docs/api/faq.md`、`internal/application/service/knowledge_faq.go` |
| 飞书社区知识检索 | 飞书数据源同步、文档知识库、混合检索 | `internal/datasource/connector/feishu/`、`docs/api/knowledge-search.md` |
| DeepSeek 回答 | DeepSeek 模型提供商 | `internal/models/provider/deepseek.go` |
| 全网搜索 | Agent Chat 与多家 Web Search Provider | `docs/api/chat.md`、`internal/infrastructure/web_search/` |
| 手机网页 | Web UI、嵌入 Widget、REST API | `frontend/`、嵌入接口 |
| 微信小程序 | 原生微信小程序客户端 | `miniprogram/` |
| 异步处理 | Worker、运行时任务队列、失败重试 | `internal/application/repository/task_queue.go` |

## 不能直接等同复用

WeKnora 的运行时任务队列解决的是文档解析、问答并发和后台任务，不是 LIVE IN HDU 所要求的“未收录问题人工审核队列”。以下能力必须在独立网关中实现：

1. 固定执行 `40 题 -> 社区知识库 -> DeepSeek + 全网搜索` 的三段优先级，而不是让 Agent 自由选择工具。
2. 第三段回答强制追加：`该条回复并不在我们的知识库以及 40 个预设问题中，请注意甄别`。
3. 第三段问题写入持久化审核表，生成单调递增序号，默认按创建时间从上到下展示为“第 N 个未收录”，状态为“待审核”。
4. 管理员离线不影响用户得到第三段答案；审核是回答完成后的异步回流。
5. 审核通过后创建或更新 WeKnora FAQ，并同步回 LIVE IN HDU；驳回只改变审核状态，不删除历史。

## 基线结论

采用“保留 WeKnora 原仓库 + 新建薄网关”的方式，不在第一阶段大改上游核心。这样既能快速上线，又能在以后升级 WeKnora 时控制冲突范围。
