# HDU Feishu Community OS

本项目用于执行和记录 `LIVE IN HDU` 飞书校园社区的落地工作。

Codex 在本项目中的角色是执行协调器，只负责把 ChatGPT 总控给出的任务落地为清晰文件、任务拆分和执行记录。

## 当前状态

- 飞书知识库名称：`LIVE IN HDU`
- 知识库地址：https://scnbcye3xdfz.feishu.cn/wiki/I0OwwcBeLiIHZOkmpTScv0MEnyc
- 已有一级目录：`开始使用`、`新生入学`、`学业与课程`、`选课与学籍`、`实验室与科研`、`校园生活`、`发展与就业`、`共建与反馈`
- 当前重点：目录已按学生真实使用路径重构完成，内容页正文仍需继续补充。
- 首批资料入库：已将未分类目录中 37 份去重资料发布到 13 个三级页面，高数历年卷以 5 个年份卷册入口呈现。
- 期末复习专区：已在 `学业与课程 / 课程复习` 下新增高等数学、线性代数、概率论与数理统计、离散数学、大学物理、大学英语六个入口；去重后发布 106 份附件，物理 334 张题图整理为三册可打印 PDF。
- 2026-07-15 补充批次：已检查 `最新资料` 的 24 份文件，去重后向 7 个页面发布 23 份附件；新增电路分析、数字逻辑电路、人工智能导论、公选课、奖助评优和学科竞赛页面，最终回读缺失数为 0。
- AI 检索 MVP：已形成 `docs/AI_RAG_BOT_MVP.md`，要求基于知识库回答并附来源。
- 新生问答助手：已固定 `Tencent/WeKnora` 提交 `150c073` 作为开源底座，并完成 H5 优先、微信小程序并行的部署与改造计划；尚未配置云服务器、模型密钥或正式上线。
- 本地新生问答平台：已完成 Phase A 本机交付，采用 Vue + Fastify + SQLite，支持动态预设、知识条目、未知问题诚实兜底、FIFO 审核、人工发布版本、健康检查、启停和在线备份恢复。当前生产库首次导入基线为 35 个意图、31 条原始回答、0 条自动发布答案，Q11 保持空白；运行数据和构建产物均落到 D 盘。电脑必须保持开机；尚未公网部署。
- 团队回答征集：已改为单张飞书电子表格 [`2026 新生 40 问｜团队协作总表`](https://scnbcye3xdfz.feishu.cn/wiki/Y3oTwYdC1iYABBkzrMfceEWCn4b?from=from_copylink)。Q01-Q40 全部平铺，团队成员可直接查看 `待填写 / 填写中 / 待审核 / 已完成 / 需补充` 状态并认领填写；旧多维表格和表单仅作备份，不再作为群内入口。

## 项目文件结构

```text
.
├── config/                         # 本地配置
├── apps/freshman-mvp/              # 无 Docker 的本地新生问答雏形
├── docs/                           # 项目设计与控制文档
│   ├── AI_RAG_BOT_MVP.md           # AI 检索与 Bot MVP 设计
│   ├── WEKNORA_UPSTREAM_BASELINE.md # 开源底座来源、许可与复用边界
│   ├── 新生问答助手_部署与复用决策_2026-07-21.md # 首发平台、部署和审核工作流
│   ├── 2026新生40问_群公告简版.md # 可直接复制到团队群的征集通知
│   ├── 2026新生40问_团队征集版.md # 40 问、征集要点和统一回复模板
│   ├── superpowers/plans/           # 可逐项执行的软件实施计划
│   ├── LIVE_IN_HDU_信息架构V1.md   # 学生问题路径版飞书导航树
│   ├── 首批资料归档清单_2026-05-25.md # 首批资料去重、落位与验收记录
│   ├── 期末复习资料发布清单_2026-05-28.md # 期末复习分类、物理汇编与上传验收
│   ├── 社区补充资料发布清单_2026-07-15.md # 最新资料分类、去重、落位与上传验收
│   └── control/                    # 执行控制文档
├── node_modules/                   # Node 依赖
├── scripts/                        # 飞书自动化与检查脚本
├── vendor/WeKnora/                 # 固定提交的开源问答/RAG 底座
├── README.md                       # 项目说明
├── TASKS.md                        # 任务清单与分类
├── CHANGELOG.md                    # 执行记录
├── LIVE_IN_HDU_搭建记录.txt        # 已完成飞书搭建记录
├── 杭电飞书校园社区搭建方案.txt    # 项目原始方案
├── package.json                    # Node 项目配置
├── package-lock.json               # Node 依赖锁定
└── *.png                           # 搭建过程截图
```

## 固定任务分类

所有任务必须归入以下五类之一：

1. Feishu结构
2. 内容模板
3. AI检索
4. 运营管理
5. 产品UI

## 执行规则

- 每次执行前先输出计划。
- 每次执行后更新 `TASKS.md`。
- 每次执行后更新 `CHANGELOG.md`。
- 不做战略判断。
- 不扩展功能。
- 只执行 ChatGPT 总控明确给出的任务。

## 控制文档

- [TASKS.md](TASKS.md)：任务池、状态和分类。
- [CHANGELOG.md](CHANGELOG.md)：按日期记录执行动作。
- [docs/AI_RAG_BOT_MVP.md](docs/AI_RAG_BOT_MVP.md)：AI 检索与 Bot MVP 设计。
- [docs/WEKNORA_UPSTREAM_BASELINE.md](docs/WEKNORA_UPSTREAM_BASELINE.md)：WeKnora 固定来源、许可证和复用边界。
- [docs/新生问答助手_部署与复用决策_2026-07-21.md](docs/新生问答助手_部署与复用决策_2026-07-21.md)：首发平台、部署与审核时效决策。
- [docs/superpowers/plans/2026-07-21-freshman-qa.md](docs/superpowers/plans/2026-07-21-freshman-qa.md)：三段问答和审核回流的实施计划。
- [apps/freshman-mvp/README.md](apps/freshman-mvp/README.md)：本地雏形的启动、停止、数据替换与 DeepSeek 配置方法。
- [docs/2026新生40问_团队征集版.md](docs/2026新生40问_团队征集版.md)：团队真实回答的 40 问完整征集表。
- [docs/2026新生40问_群公告简版.md](docs/2026新生40问_群公告简版.md)：可直接复制到群里的征集公告。
- [docs/LIVE_IN_HDU_信息架构V1.md](docs/LIVE_IN_HDU_信息架构V1.md)：学生问题路径版信息架构。
- [docs/社区补充资料发布清单_2026-07-15.md](docs/社区补充资料发布清单_2026-07-15.md)：本轮 23 份资料的分类、去重、页面链接与验收记录。
- [docs/control/EXECUTION_RULES.md](docs/control/EXECUTION_RULES.md)：执行协调器规则。
- [docs/control/TASK_CATEGORIES.md](docs/control/TASK_CATEGORIES.md)：五类任务边界。
