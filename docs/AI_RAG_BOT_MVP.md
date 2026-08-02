# HDU Feishu Community OS AI 检索与 Bot MVP

日期：2026-05-18

## 1. V1 目标

V1 只做一个最小可用的知识库问答系统：

- 将飞书文档内容整理为 Markdown 和 JSON。
- 将文档切分为可检索的知识块。
- 为每个知识块保留来源、栏目、更新时间、可靠等级等 metadata。
- 用 RAG 流程基于知识库回答问题。
- Bot 回答必须带来源。
- Bot 不允许自由编造校园事实。
- 不做复杂 Agent。
- 不做全自动审核。

V1 的判断标准不是“像人一样聪明”，而是“能稳定回答知识库里已有的问题，并在没有依据时明确拒答”。

## 2. 输入内容格式

飞书文档导出或同步后，先进入本地标准格式。V1 建议同时保留 Markdown 和 JSON。

### 2.1 Markdown 文档格式

每篇飞书文档保存为一份 Markdown：

```text
kb/raw_markdown/
├── freshman/
│   ├── arrival-checklist.md
│   └── dorm-supplies.md
├── academic/
│   └── calculus-review.md
└── faq/
    └── freshman-faq.md
```

单篇 Markdown 模板：

```markdown
---
doc_id: feishu_wiki_D1XDwzXHzij7cGkrqLqczfxKnQK_arrival_checklist
title: 报到前准备清单
category: 新生生存指南
source_type: feishu_doc
source_url: https://scnbcye3xdfz.feishu.cn/wiki/...
reliability: B
last_updated: 2026-05-18
owner: 新生生存指南负责人
review_status: reviewed
---

# 报到前准备清单

## 一句话结论

...

## 适用对象

...

## 正文

...

## 注意事项

...

## 资料来源

...
```

### 2.2 JSON 文档格式

每篇文档另存为结构化 JSON，便于后续切 chunk：

```json
{
  "doc_id": "feishu_wiki_D1XDwzXHzij7cGkrqLqczfxKnQK_arrival_checklist",
  "title": "报到前准备清单",
  "category": "新生生存指南",
  "source_type": "feishu_doc",
  "source_url": "https://scnbcye3xdfz.feishu.cn/wiki/...",
  "reliability": "B",
  "last_updated": "2026-05-18",
  "owner": "新生生存指南负责人",
  "review_status": "reviewed",
  "sections": [
    {
      "heading_path": ["报到前准备清单", "正文", "证件材料"],
      "text": "..."
    }
  ]
}
```

V1 只接收 `review_status = reviewed` 或 `review_status = published` 的内容进入索引。草稿、未审核投稿、群聊临时消息不进 Bot 知识库。

## 3. Chunk 结构

知识块是检索的最小单位。V1 不追求复杂切分，按标题层级和长度切即可。

### 3.1 切分规则

- 优先按 Markdown 标题切分。
- 一个 chunk 建议 300 到 800 中文字。
- 太短的 FAQ 可以一问一答作为一个 chunk。
- 太长的段落按自然段合并，超过 800 字再拆。
- 每个 chunk 必须保留所属文档标题和 heading path。
- 不把不同文档、不同主题混在一个 chunk 中。

### 3.2 Chunk JSON

```json
{
  "chunk_id": "chk_20260518_000001",
  "doc_id": "feishu_wiki_D1XDwzXHzij7cGkrqLqczfxKnQK_arrival_checklist",
  "title": "报到前准备清单",
  "heading_path": ["报到前准备清单", "正文", "证件材料"],
  "content": "报到前建议准备身份证、录取通知书、证件照等材料。具体要求以当年学校官方通知为准。",
  "content_type": "guide",
  "tokens_estimate": 95,
  "metadata": {
    "category": "新生生存指南",
    "tags": ["新生", "报到", "材料"],
    "source_type": "feishu_doc",
    "source_url": "https://scnbcye3xdfz.feishu.cn/wiki/...",
    "source_title": "报到前准备清单",
    "source_anchor": "正文/证件材料",
    "reliability": "B",
    "last_updated": "2026-05-18",
    "owner": "新生生存指南负责人",
    "review_status": "reviewed",
    "visibility": "internal",
    "campus": "unspecified",
    "audience": ["本科新生"]
  }
}
```

## 4. Metadata 字段

V1 必备字段：

| 字段 | 类型 | 必填 | 说明 |
| --- | --- | --- | --- |
| `chunk_id` | string | 是 | 知识块唯一 ID |
| `doc_id` | string | 是 | 来源文档 ID |
| `title` | string | 是 | 来源文档标题 |
| `heading_path` | array | 是 | chunk 在文档中的标题路径 |
| `content` | string | 是 | 用于检索和回答的正文 |
| `category` | string | 是 | 一级栏目，如新生生存指南、学业资料库 |
| `tags` | array | 是 | 检索标签 |
| `source_url` | string | 是 | 飞书文档链接 |
| `source_title` | string | 是 | 来源标题 |
| `source_anchor` | string | 否 | 文档内位置 |
| `reliability` | string | 是 | A/B/C 可靠等级 |
| `last_updated` | date | 是 | 最后更新时间 |
| `owner` | string | 否 | 负责人 |
| `review_status` | string | 是 | `draft`、`reviewed`、`published`、`archived` |
| `visibility` | string | 是 | `public`、`internal`、`restricted` |
| `audience` | array | 否 | 适用对象 |
| `campus` | string | 否 | 校区，不确定则写 `unspecified` |

可靠等级：

- A：学校官方通知、官网、教务系统等明确官方来源。
- B：多人验证过的学生经验或栏目负责人审核过的内容。
- C：单人经验，仅供参考。

V1 回答时可以使用 A/B/C 内容，但必须把可靠等级展示给用户。涉及政策、流程、时间、费用、考试安排时，优先使用 A 级来源；没有 A 级来源时必须提示“请以学校官方通知为准”。

## 5. RAG 检索流程

V1 流程保持简单：

```text
用户问题
  ↓
问题预处理
  ↓
向量检索 Top K
  ↓
关键词检索 Top K
  ↓
结果合并与去重
  ↓
按相关度、可靠等级、更新时间重排
  ↓
低置信度判断
  ↓
基于命中的 chunk 生成回答
  ↓
附来源列表
```

### 5.1 问题预处理

只做轻量处理：

- 去掉多余空格。
- 保留原问题。
- 提取可能的栏目关键词，例如“新生”“寝室”“高数”“转专业”“快递”。
- 不进行复杂意图识别。

### 5.2 检索策略

V1 使用混合检索：

- 向量检索：找语义相近内容。
- 关键词检索：保证“高数 A”“四六级”“转专业”等明确词不丢。
- Top K：向量取 8 条，关键词取 8 条，合并后最多保留 10 条。

### 5.3 重排规则

排序分数可以用简单加权：

```text
final_score =
  0.60 * semantic_score +
  0.25 * keyword_score +
  0.10 * reliability_score +
  0.05 * freshness_score
```

可靠等级分：

- A = 1.0
- B = 0.8
- C = 0.5

更新时间分：

- 180 天内 = 1.0
- 365 天内 = 0.8
- 超过 365 天 = 0.5
- 未标注更新时间 = 0.2

### 5.4 低置信度拒答

满足任一条件，Bot 不直接回答：

- 没有命中任何 chunk。
- 最高相关度低于阈值。
- 命中内容互相冲突。
- 命中内容只有 C 级来源，且问题涉及政策、时间、费用、官方流程。
- 问题要求预测、保证、承诺或代替学校官方解释。
- 问题涉及隐私、个人评价、敏感身份信息。

拒答不是沉默，而是给出下一步：

```text
我没有在当前知识库中找到足够可靠的依据，不能直接回答这个问题。
你可以查看/补充这些入口：
1. 知识问答与 FAQ
2. 反馈与纠错
3. 对应栏目负责人
```

## 6. Bot 回答规范

### 6.1 标准回答结构

Bot 回答固定包含四部分：

```text
结论：
...

依据：
- ...
- ...

注意：
...

来源：
1. 《来源文档标题》｜栏目｜可靠等级｜更新时间｜链接
2. ...
```

### 6.2 回答原则

- 只使用检索命中的知识库内容回答。
- 不使用模型自己的校园常识补事实。
- 不把“可能”“听说”“一般来说”包装成确定事实。
- 每个事实性结论尽量能对应到来源。
- 内容过期、低等级或非官方时，明确提示可靠性。
- 对政策、时间、费用、考试、培养方案等问题，提示以学校官方通知为准。
- 用户问多个问题时，分点回答，并分别给来源。

### 6.3 可回答示例

用户：新生报到前要准备什么？

Bot：

```text
结论：
当前知识库建议你先准备证件材料、生活用品和到校当天需要使用的资料。

依据：
- 报到材料以《报到前准备清单》中列出的内容为准。
- 寝室用品可参考《寝室床铺与生活用品》。

注意：
如果涉及当年具体报到时间、地点或学院安排，请以学校官方通知为准。

来源：
1. 《报到前准备清单》｜新生生存指南｜B｜2026-05-18｜https://...
2. 《寝室床铺与生活用品》｜新生生存指南｜B｜2026-05-18｜https://...
```

### 6.4 不足依据示例

用户：今年转专业一定能成功吗？

Bot：

```text
我不能保证转专业结果。当前知识库没有足够可靠的官方依据说明“今年一定能成功”。

你可以查看知识库中的《转专业流程》了解一般流程；具体名额、条件、时间和结果请以学校或学院当年官方通知为准。

来源：
1. 《转专业流程》｜选课与培养｜B｜2026-05-18｜https://...
```

## 7. AI 不能回答什么

Bot 不能回答或不能直接给确定结论的范围：

- 知识库没有来源的问题。
- 要求编造校园政策、流程、时间、费用、地点、联系人、群号的问题。
- 要求预测录取、转专业、保研、竞赛获奖、考试成绩、就业结果的问题。
- 涉及个人隐私的问题，例如手机号、学号、宿舍号、身份证号、个人评价。
- 涉及人身攻击、造谣、挂人、曝光个人信息的问题。
- 涉及绕过学校规定、作弊、代考、盗版资料传播的问题。
- 涉及医疗、法律、财务等高风险建议的问题；只能建议咨询专业机构或官方渠道。
- 命中内容冲突且没有更高可靠等级来源能裁决的问题。

固定拒答话术：

```text
我不能基于当前知识库可靠回答这个问题，因为缺少可引用来源或问题超出了社区知识库范围。
如果你认为这是高频问题，可以通过“反馈与纠错”入口提交补充建议。
```

## 8. 最小 Demo 架构

V1 Demo 使用本地文件和轻量服务即可，不接复杂工作流。

```text
Feishu 文档
  ↓ 手动导出 / 简单脚本同步
kb/raw_markdown/*.md
  ↓ parse
kb/documents/*.json
  ↓ chunk
kb/chunks/*.jsonl
  ↓ embed + index
vector_store/
  ↓
RAG API
  ↓
Bot Webhook / 飞书 Bot
```

### 8.1 目录结构

```text
.
├── kb/
│   ├── raw_markdown/          # 飞书文档导出的 Markdown
│   ├── documents/             # 标准化文档 JSON
│   ├── chunks/                # chunk JSONL
│   └── index_manifest.json    # 索引构建记录
├── bot/
│   ├── rag_api.js             # 问答 API
│   ├── retrieve.js            # 检索逻辑
│   ├── answer_policy.md       # Bot 回答规范
│   └── feishu_bot.js          # 飞书 Bot Webhook 入口
├── scripts/
│   ├── export_feishu_docs.js  # 后续可选：同步飞书文档
│   ├── build_documents.js     # Markdown -> JSON
│   ├── build_chunks.js        # JSON -> JSONL chunks
│   └── build_index.js         # chunks -> vector index
└── docs/
    └── AI_RAG_BOT_MVP.md
```

### 8.2 Demo API

请求：

```json
{
  "question": "新生报到前要准备什么？",
  "user_id": "ou_xxx",
  "channel": "feishu_bot"
}
```

响应：

```json
{
  "answer": "结论：...\n\n依据：...\n\n注意：...\n\n来源：...",
  "confidence": "medium",
  "sources": [
    {
      "title": "报到前准备清单",
      "url": "https://scnbcye3xdfz.feishu.cn/wiki/...",
      "category": "新生生存指南",
      "reliability": "B",
      "last_updated": "2026-05-18"
    }
  ],
  "refusal": false
}
```

### 8.3 最小实现建议

V1 可以这样落地：

1. 先手动整理 5 到 20 篇核心飞书文档为 Markdown。
2. 用脚本把 Markdown frontmatter 和正文转为 JSON。
3. 用脚本按标题切 chunk，输出 JSONL。
4. 使用一个本地向量库或轻量数据库保存 chunk 和 embedding。
5. 飞书 Bot 收到问题后调用 RAG API。
6. RAG API 返回答案和来源。
7. 低置信度时拒答，并引导用户去反馈与纠错。

不进入 V1 的内容：

- 不做多步骤 Agent。
- 不做自动上网搜索。
- 不自动写回知识库。
- 不自动审核投稿。
- 不自动判断校园政策真伪。
- 不从群聊历史中直接抽取未经审核内容回答。

## 9. V1 验收清单

- 至少 5 篇已审核 Markdown 文档进入索引。
- 每个 chunk 都有 `source_url`、`reliability`、`last_updated`。
- Bot 回答每次都显示来源。
- 知识库没有命中时，Bot 能拒答。
- 问政策、时间、费用、考试安排时，Bot 会提示以官方通知为准。
- Bot 不使用无来源事实回答校园问题。
- Demo 能通过一个本地 API 或飞书 Bot Webhook 完成一次问答。
