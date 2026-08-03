import { describe, expect, it, vi } from 'vitest';
import { API_PROXY_KEY } from '../../vite.config.js';
import { isUiPreviewMode, listQuestions } from '../../web/api.js';
import { UI_PREVIEW_QUESTIONS } from '../../web/mock/questions.js';

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('UI preview boundaries', () => {
  it('proxies real API paths without intercepting the frontend api.ts module', () => {
    const apiProxy = new RegExp(API_PROXY_KEY);

    expect(apiProxy.test('/api/questions')).toBe(true);
    expect(apiProxy.test('/api/ask')).toBe(true);
    expect(apiProxy.test('/api')).toBe(true);
    expect(apiProxy.test('/api.ts')).toBe(false);
    expect(apiProxy.test('/api-client.ts')).toBe(false);
  });

  it('provides exactly five ordered and clearly simulated freshman questions', () => {
    expect(UI_PREVIEW_QUESTIONS).toHaveLength(5);
    expect(UI_PREVIEW_QUESTIONS.map((item) => item.displayOrder)).toEqual([1, 2, 3, 4, 5]);
    expect(new Set(UI_PREVIEW_QUESTIONS.map((item) => item.id)).size).toBe(5);
    expect(UI_PREVIEW_QUESTIONS.map((item) => item.question)).toEqual([
      '新生报到前需要准备哪些材料？',
      '宿舍环境怎么样，需要自带哪些生活用品？',
      '校园卡、智慧杭电和钉钉认证怎么使用？',
      '食堂、超市和快递点分别在哪里？',
      '新生应该怎么选课、参加社团和安排课余时间？',
    ]);
    expect(UI_PREVIEW_QUESTIONS.every((item) => item.summary && item.fullAnswer)).toBe(true);
    expect(UI_PREVIEW_QUESTIONS.every((item) => item.sources.length > 0)).toBe(true);
  });

  it('recognizes only the dedicated UI preview mode', () => {
    expect(isUiPreviewMode('ui-preview')).toBe(true);
    expect(isUiPreviewMode('production')).toBe(false);
    expect(isUiPreviewMode('test')).toBe(false);
  });

  it('keeps production question loading on the real API path', async () => {
    const serverItem = UI_PREVIEW_QUESTIONS[0];
    const fetcher = vi.fn(async () => jsonResponse({ items: [serverItem] }));
    const items = await listQuestions({ fetcher });

    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith('/api/questions');
    expect(items).toEqual([serverItem]);
  });
});
