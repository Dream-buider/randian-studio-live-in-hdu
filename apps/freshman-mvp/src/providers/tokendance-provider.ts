import { ServiceUnavailableError, ValidationError } from '../domain/errors.js';
import type { QuestionIntent, SourceRef } from '../domain/models.js';
import type {
  IntentClassification,
  KnowledgeSynthesisInput,
  ModelAnswer,
  ModelProvider,
  SynthesisInput,
} from './contracts.js';

const DEFAULT_ENDPOINT = 'https://tokendance.space/gateway/v1/chat/completions';
const DEFAULT_MODEL = 'deepseek-v4-flash';

interface TokenDanceOptions {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  endpoint?: string;
  modelId?: string;
  timeoutMs?: number;
  confidenceThreshold?: number;
}

type ChatResponse = {
  choices: Array<{ message: { content: string } }>;
};

function chatContent(value: unknown): string | null {
  if (
    typeof value !== 'object'
    || value === null
    || !('choices' in value)
    || !Array.isArray(value.choices)
    || value.choices.length === 0
  ) {
    return null;
  }
  const first = value.choices[0];
  if (
    typeof first !== 'object'
    || first === null
    || !('message' in first)
    || typeof first.message !== 'object'
    || first.message === null
    || !('content' in first.message)
    || typeof first.message.content !== 'string'
  ) {
    return null;
  }
  return first.message.content;
}

function classificationFromContent(
  content: string,
  allowedIds: Set<string>,
  threshold: number,
): IntentClassification | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (
    typeof parsed !== 'object'
    || parsed === null
    || !('intentId' in parsed)
    || !('confidence' in parsed)
    || !('reason' in parsed)
    || (parsed.intentId !== null && typeof parsed.intentId !== 'string')
    || typeof parsed.confidence !== 'number'
    || !Number.isFinite(parsed.confidence)
    || parsed.confidence < 0
    || parsed.confidence > 1
    || typeof parsed.reason !== 'string'
  ) {
    return null;
  }
  if (
    parsed.intentId === null
    || !allowedIds.has(parsed.intentId)
    || parsed.confidence < threshold
  ) {
    return null;
  }
  return {
    intentId: parsed.intentId,
    confidence: parsed.confidence,
    reason: parsed.reason,
  };
}

export class TokenDanceProvider implements ModelProvider {
  private readonly apiKey: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly endpoint: string;
  private readonly modelId: string;
  private readonly timeoutMs: number;
  private readonly confidenceThreshold: number;
  private lastCallStatus: 'never' | 'ok' | 'error' = 'never';
  private lastCallAt: string | null = null;

  constructor(options: TokenDanceOptions) {
    const apiKey = options.apiKey.trim();
    if (apiKey.length === 0) {
      throw new ValidationError('TokenDance API key is required');
    }
    this.apiKey = apiKey;
    this.fetch = options.fetch ?? globalThis.fetch;
    this.endpoint = options.endpoint ?? DEFAULT_ENDPOINT;
    this.modelId = options.modelId ?? DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.confidenceThreshold = options.confidenceThreshold ?? 0.7;
  }

  status(): {
    status: 'configured';
    lastCallStatus: 'never' | 'ok' | 'error';
    lastCallAt: string | null;
  } {
    return {
      status: 'configured',
      lastCallStatus: this.lastCallStatus,
      lastCallAt: this.lastCallAt,
    };
  }

  private recordCall(status: 'ok' | 'error'): void {
    this.lastCallStatus = status;
    this.lastCallAt = new Date().toISOString();
  }

  private async complete(
    messages: Array<{ role: 'system' | 'user'; content: string }>,
    maxTokens: number,
  ): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.modelId,
          messages,
          temperature: 0.1,
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new ServiceUnavailableError('TokenDance request failed');
      }
      const data = await response.json() as ChatResponse;
      const content = chatContent(data);
      if (content === null) {
        throw new ServiceUnavailableError('TokenDance returned an invalid response');
      }
      this.recordCall('ok');
      return content;
    } catch (error) {
      this.recordCall('error');
      if (error instanceof ServiceUnavailableError) {
        throw error;
      }
      throw new ServiceUnavailableError('TokenDance is temporarily unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }

  async classifyIntent(
    question: string,
    intents: QuestionIntent[],
  ): Promise<IntentClassification | null> {
    const active = intents.filter((intent) => intent.active);
    try {
      const content = await this.complete([
        {
          role: 'system',
          content: [
            '你是校园问题意图分类器。',
            '只能返回一个 JSON 对象：{"intentId":"允许的ID或null","confidence":0到1,"reason":"简短原因"}。',
            '不得返回目录之外的 ID。',
          ].join(''),
        },
        {
          role: 'user',
          content: JSON.stringify({
            question,
            intents: active.map((intent) => ({
              id: intent.id,
              question: intent.question,
              intentDescription: intent.intentDescription,
              aliases: intent.aliases,
              keywords: intent.keywords,
              excludeKeywords: intent.excludeKeywords,
            })),
          }),
        },
      ], 192);
      return classificationFromContent(
        content,
        new Set(active.map((intent) => intent.id)),
        this.confidenceThreshold,
      );
    } catch {
      return null;
    }
  }

  async synthesize(input: SynthesisInput): Promise<ModelAnswer> {
    const searchState = input.search.status === 'available'
      ? {
          status: '搜索服务可用',
          items: input.search.leads,
        }
      : {
          status: '搜索服务当前不可用',
          items: [],
        };
    const text = (await this.complete([
      {
        role: 'system',
        content: [
          '你是杭州电子科技大学新生答疑助手。',
          '搜索标题、摘要和链接只是未经审核的公开线索，不是已核实知识。',
          '必须给出非空、谨慎、可执行的回答，只能引用输入中提供的URL，不得编造来源。',
          '若来源冲突或不足以证明事实，要明确说明；不得编造日期、电话、费用、政策、比例或名额。',
          '不得把其他学校的普遍情况写成杭电事实；通用建议必须单独标注，并与杭州电子科技大学的事实区分。',
          '若搜索不可用，应说明可执行的校方核验途径，但不要回复“未收录”。',
        ].join(''),
      },
      {
        role: 'user',
        content: JSON.stringify({ question: input.question, search: searchState }),
      },
    ], 800)).trim();
    if (text.length === 0) {
      throw new ServiceUnavailableError('TokenDance returned an empty answer');
    }
    const sources: SourceRef[] = input.search.status === 'available'
      ? input.search.leads.map((item) => ({
          type: 'web',
          title: item.title,
          url: item.url,
          updatedAt: null,
        }))
      : [];
    return { text, sources };
  }

  async synthesizeKnowledge(input: KnowledgeSynthesisInput): Promise<ModelAnswer> {
    const text = (await this.complete([
      {
        role: 'system',
        content: [
          '你是杭州电子科技大学新生答疑助手。',
          '回答必须先直接回应问题，只能依据输入知识片段，不得补充片段没有提供的杭电事实。',
          '不得把其他学校的普遍情况写成杭电事实。',
          '必须区分杭州电子科技大学证据与一般经验，通用建议必须单独标注。',
          '若知识片段冲突、过时或不足，要明确保留不确定性。',
          '不得编造日期、电话、费用、政策、比例、名额或URL，也不得输出来源列表。',
        ].join(''),
      },
      {
        role: 'user',
        content: JSON.stringify({
          question: input.question,
          hits: input.hits.map(({ content, title, source }) => ({ content, title, source })),
        }),
      },
    ], 800)).trim();
    if (text.length === 0) {
      throw new ServiceUnavailableError('TokenDance returned an empty answer');
    }
    return { text, sources: [] };
  }
}
