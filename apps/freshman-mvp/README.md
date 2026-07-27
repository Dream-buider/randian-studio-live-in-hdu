# LIVE IN HDU 本地新生问答 MVP

无需 Docker，也无需安装新的 npm 包。运行环境为本机 Node.js 24。

## 一键启动

在项目根目录运行：

```powershell
.\scripts\start-freshman-mvp.ps1
```

脚本会启动后台服务并打开问答页：

- 问答页：`http://localhost:3210`
- 审核后台：`http://localhost:3210/admin`
- 同一 Wi-Fi 手机：使用脚本打印的 `http://局域网IP:3210`

停止服务：

```powershell
.\scripts\stop-freshman-mvp.ps1
```

## 当前模式

未配置 Key 时为演示模式。40 个意图的本地近似匹配、知识库检索、风险批注、审核排队、人工通过/驳回和审核通过后回写知识库都是真实逻辑；大模型意图识别与第三段联网回答需要 DeepSeek Key。

若要接入真实 DeepSeek V4：

1. 将 `.env.example` 复制为 `.env.local`。
2. 在 `.env.local` 中填写 `DEEPSEEK_API_KEY`。
3. 若要真正先搜索再回答，同时填写兼容 Tavily 返回格式的 `WEB_SEARCH_ENDPOINT` 和 `WEB_SEARCH_API_KEY`。
4. 重启服务。

DeepSeek 默认模型为 `deepseek-v4-flash`，可改为 `deepseek-v4-pro`。

## 当前 40 问征集流程

旧的简略答案已停用。`data/presets.json` 现在保存 40 个“意图”，全部为 `answerStatus: "collecting"`，不会把空答案或旧答案返回给用户。

1. 把 `../../docs/2026新生40问_群公告简版.md` 发到群里。
2. 团队按 `../../docs/2026新生40问_团队征集版.md` 的问题编号回复；Markdown、聊天记录和截图均可。
3. 汇总时保留回答者身份、校区、学院/专业、入学年份、亲历/听说和信息日期。
4. Codex 对同一问题的多份回答去重、标注分歧和时效性，形成待审核稿。
5. 人工确认后，将该意图改成 `answerStatus: "approved"` 并填入 `answer` 与 `sources`，程序才会直接返回正式答案。

征集阶段命中某个意图时，页面会明确显示“答案征集中”，不会假装已有可信答案。

## 意图识别不是字符串写死

每条预设数据含标准问题、意图说明、相似问法、关键词和排除词。请求依次经过：

1. 本地规则快速命中明显问法；
2. 未明显命中时，由 DeepSeek 在允许的 40 个意图 ID 中做 JSON 分类；
3. 只有置信度达到 `INTENT_CONFIDENCE` 才采用模型判断；
4. 分类失败、超时或置信度不足时继续走知识库和联网兜底，不会阻塞。

因此“杭州电子科技大学怎么办校园卡”“学校怎么办校园卡”“一卡通去哪里领”可归到同一意图；而“校园卡丢了怎么挂失”会被排除，继续命中挂失知识条目。

## 替换真实内容

- `data/presets.json`：40 个初始意图及团队审核后的回答；条目可增减，不存在写死的 40 条循环。
- `data/knowledge.json`：今天版的本地知识库；审核通过的问题会自动追加。
- `data/reviews.json`：持久化审核队列，不要在运行时手工修改。

每个预设或知识条目格式：

```json
{
  "id": "unique-id",
  "category": "问题分类",
  "question": "标准问题",
  "intentDescription": "该意图覆盖什么、不覆盖什么",
  "aliases": ["相似问法"],
  "keywords": ["关键词"],
  "intentKeywords": ["确认意图的动作词"],
  "excludeKeywords": ["应交给相邻意图的排除词"],
  "answerStatus": "approved",
  "answer": "审核后的答案",
  "sources": [{ "title": "来源标题", "url": "来源链接" }]
}
```

## 测试

```powershell
npm run test:mvp
```

正式公网部署前仍需增加管理员登录、PostgreSQL、HTTPS、限流和飞书同步。
