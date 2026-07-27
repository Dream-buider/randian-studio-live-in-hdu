const DEMO_SOURCE = {
  title: '本地演示模式',
  url: '',
};

function demoAnswer(question, reason = '') {
  const suffix = reason ? `（外部服务暂不可用：${reason}）` : '';
  return {
    text: `关于“${question}”，当前本地雏形已完成联网兜底流程，但尚未配置真实搜索与模型密钥${suffix}。正式接入后，这里会展示 DeepSeek V4 根据网络线索整理的答案；涉及校规、时间、费用和办理流程时，请优先核对杭州电子科技大学官方通知。`,
    sources: [DEMO_SOURCE],
    mode: 'demo',
  };
}

async function responseJson(response, service) {
  const text = await response.text();
  if (!response.ok) throw new Error(`${service} HTTP ${response.status}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${service} returned invalid JSON`);
  }
}

export class DeepSeekProvider {
  constructor({ config, fetchImpl = fetch }) {
    this.config = config;
    this.fetch = fetchImpl;
  }

  async #search(question, signal) {
    if (!this.config.webSearchEndpoint) return { context: '', sources: [] };
    const response = await this.fetch(this.config.webSearchEndpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(this.config.webSearchApiKey
          ? { Authorization: `Bearer ${this.config.webSearchApiKey}` }
          : {}),
      },
      body: JSON.stringify({ query: question, max_results: 5, search_depth: 'basic' }),
      signal,
    });
    const data = await responseJson(response, 'web search');
    const results = Array.isArray(data.results) ? data.results : [];
    return {
      context: results
        .slice(0, 5)
        .map((item, index) => `[${index + 1}] ${item.title || ''}\n${item.content || item.snippet || ''}\n${item.url || ''}`)
        .join('\n\n'),
      sources: results.slice(0, 5).map((item) => ({ title: item.title || '网络来源', url: item.url || '' })),
    };
  }

  async classifyIntent(question, intents) {
    if (this.config.demoMode) return null;
    const allowed = (intents || [])
      .filter((intent) => intent?.id && intent?.question)
      .map((intent) => ({
        id: intent.id,
        question: intent.question,
        description: intent.intentDescription || '',
        examples: intent.aliases || [],
        exclusions: intent.excludeKeywords || [],
      }));
    if (allowed.length === 0) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs || 20_000);
    try {
      const intentCatalog = JSON.stringify(allowed);
      const response = await this.fetch(`${this.config.deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${this.config.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.deepseekModel,
          thinking: { type: 'disabled' },
          stream: false,
          response_format: { type: 'json_object' },
          messages: [
            {
              role: 'system',
              content: `你是新生问答意图分类器。只判断用户问题是否属于下列意图之一，不回答问题。必须返回 JSON 对象：{"intentId": "允许的ID或null", "confidence": 0到1的数字, "reason": "简短理由"}。只有语义明确一致时才选择；不得创造ID；相邻意图及 exclusions 要严格区分。允许的意图：${intentCatalog}`,
            },
            { role: 'user', content: question },
          ],
        }),
        signal: controller.signal,
      });
      const data = await responseJson(response, 'DeepSeek intent classifier');
      const content = data?.choices?.[0]?.message?.content;
      if (!content) return null;
      const parsed = JSON.parse(content);
      const allowedIds = new Set(allowed.map((intent) => intent.id));
      const confidence = Number(parsed.confidence);
      if (!allowedIds.has(parsed.intentId) || !Number.isFinite(confidence)) return null;
      return {
        intentId: parsed.intentId,
        confidence: Math.max(0, Math.min(confidence, 1)),
        reason: String(parsed.reason || '').slice(0, 200),
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async answer(question) {
    if (this.config.demoMode) return demoAnswer(question);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.requestTimeoutMs);
    try {
      const search = await this.#search(question, controller.signal);
      const response = await this.fetch(`${this.config.deepseekBaseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${this.config.deepseekApiKey}`,
        },
        body: JSON.stringify({
          model: this.config.deepseekModel,
          thinking: { type: 'disabled' },
          stream: false,
          messages: [
            {
              role: 'system',
              content: '你是 LIVE IN HDU 新生信息助手。根据提供的网络线索用中文回答。不得虚构校规、时间、费用或来源；线索不足时给出合理方向并明确建议核对学校官方通知。回答简洁、可操作。',
            },
            {
              role: 'user',
              content: `问题：${question}\n\n网络线索：\n${search.context || '未配置独立搜索结果，请仅提供一般性线索并提醒核实。'}`,
            },
          ],
        }),
        signal: controller.signal,
      });
      const data = await responseJson(response, 'DeepSeek');
      const text = data?.choices?.[0]?.message?.content?.trim();
      if (!text) throw new Error('DeepSeek returned an empty answer');
      return { text, sources: search.sources, mode: 'live' };
    } catch (error) {
      const reason = error.name === 'AbortError' ? '请求超时' : error.message;
      return demoAnswer(question, reason);
    } finally {
      clearTimeout(timer);
    }
  }
}
