import type {
  AnswerResult,
  QuestionContext,
} from '../api.js';

export function createUiPreviewAnswer(
  question: string,
  context?: QuestionContext,
): AnswerResult {
  const normalizedQuestion = question.trim();
  const contextHint = context?.category
    ? `当前参考主题是“${context.category}”。`
    : '';

  return {
    route: 'knowledge',
    trustStatus: 'knowledge',
    answer: `这是 UI 测试版的模拟回答：你问的是“${normalizedQuestion}”。${contextHint}正式版本会优先匹配已审核答案，再查询新生指北；宿舍管理时间等动态信息请以当年学校或宿管通知为准。`,
    sources: [{
      type: 'community',
      title: 'UI 测试版 · 模拟回答（不代表正式发布数据）',
      url: '',
      updatedAt: null,
    }],
  };
}
