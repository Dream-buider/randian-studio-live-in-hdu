# LIVE IN HDU Agent claims and evidence matrix

本矩阵是初赛路演、Demo 与后续交付物的唯一事实口径。`现有证据` 仅指可独立复核的既有能力；`初赛原型` 仅指本地、确定性、受控 GOAI 任务闭环；`复赛路线` 不是已实现能力。

| ID | Approved claim | Level | Evidence | Forbidden expansion |
| --- | --- | --- | --- | --- |
| C01 | LIVE IN HDU 已具备校园知识、来源追踪、搜索、审核与运行底座 | 现有证据 | 既有平台测试、浏览器界面与运行健康输出；见 `agent-vertical-slice-evidence.md` | 不写用户量、覆盖学校数或官方合作 |
| C02 | 用户可用一句话创建 GOAI 初赛准备任务 | 初赛原型 | 持久化 Agent task HTTP 与浏览器验收；见 `evidence/acceptance-2026-08-13T07-50-04.686Z.json` | 不写支持任意校园目标 |
| C03 | Agent 会生成七步计划并在执行前请求授权 | 初赛原型 | 任务 JSON、审批事件与 Orchestrator/API 测试 | 不写完全自主、无需人工 |
| C04 | Agent 调用规则、材料、校验、清单和打包工具 | 初赛原型 | 持久化工具事件、artifact 与 `goai-agent-tools` 测试 | 不写飞书 API 已接入 |
| C05 | 作品简介从 537 字失败自动修订到 492 字通过 | 初赛原型 | validator 测试、492 字下载 artifact 与验收 JSON | 不写所有文档都能自动纠错 |
| C06 | GOAI 官网最终提交保持等待用户确认 | 初赛原型 | 被阻塞的第七步、任务状态与验收 JSON | 不写已自动报名或提交成功 |
| C07 | 科研、奖学金、转专业和实习是可复制方向 | 复赛路线 | 路线图；尚无这些场景的已运行闭环 | 不写相关场景已上线 |
| C08 | 飞书日历、任务和外部业务系统将在授权后接入 | 复赛路线 | 接口边界与复赛计划；尚未生产接入 | 不写生产运行 |

## Required terms

- 产品名：`LIVE IN HDU Agent`
- 定位：`面向大学生的成长任务操作系统`
- 标语：`一句话，把大学生成长目标推进到可提交。`
- 高风险终点：`等待用户确认`
