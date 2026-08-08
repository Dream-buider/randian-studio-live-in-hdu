# UI Preview 模拟回答设计

## 目标

让 `ui-preview` 模式下的自由提问形成完整演示闭环，不依赖后端；正式模式继续调用 `/api/ask`，行为保持不变。

## 边界

- 仅 `import.meta.env.MODE === 'ui-preview'` 使用本地模拟回答。
- 模拟回答必须明确写出“UI 测试版”和“模拟回答”，不得伪装成正式审核内容。
- 模拟回答回显用户问题，并提醒动态信息以当年学校或宿管通知为准。
- 模拟数据放在 `web/mock/`，通过动态导入加载，生产构建不得包含模拟文案。
- 不改问题卡、指北信号站、倒计时、正式 API 协议或后端。

## 数据流

1. `QuestionDeckView` 继续把提问写入现有 chat session。
2. `ChatView` 继续调用 `askQuestion()`，无需增加预览专用分支。
3. `askQuestion()` 在 `ui-preview` 模式动态加载模拟回答工厂并返回合法的 `AnswerResult`。
4. 非 `ui-preview` 模式继续向 `/api/ask` 发送现有请求。

## 失败与安全

- 模拟回答采用 `knowledge` 路由，但正文和来源标题均明确标注模拟性质。
- 正式接口失败、重试和会话防重复逻辑保持现状。
- URL 仍通过现有 `SourceList` 安全边界处理；模拟来源不提供外链。

## 验收

- 定向测试证明预览分支不调用网络并返回明确标注的合法回答。
- 生产分支仍调用 `/api/ask`。
- `npm.cmd run test:web`、`npm.cmd run build`、`npm.cmd run build:trial` 通过。
- 浏览器中从问题卡提交自由问题后显示模拟回答，不再进入失败页。
