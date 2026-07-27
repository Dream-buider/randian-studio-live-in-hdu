import { ServiceUnavailableError, ValidationError } from '../domain/errors.js';
import type { QuestionIntent, SourceRef } from '../domain/models.js';
import type {
  IntentClassification,
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

  private async complete(messages: Array<{ role: 'system' | 'user'; content: string }>): Promise<string> {
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
      return content;
    } catch (error) {
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
      ]);
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
    const searchState = input.search.available
      ? {
          status: '搜索服务可用',
          items: input.search.items,
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
          '必须给出非空、谨慎、可执行的回答；不得声称获得了未提供的检索结果。',
          '若搜索不可用，应明确不确定性并建议以校方最新通知为准，但不要回复“未收录”。',
        ].join(''),
      },
      {
        role: 'user',
        content: JSON.stringify({ question: input.question, search: searchState }),
      },
    ])).trim();
    if (text.length === 0) {
      throw new ServiceUnavailableError('TokenDance returned an empty answer');
    }
    const sources: SourceRef[] = input.search.available
      ? input.search.items.map((item) => ({
          type: 'web',
          title: item.title,
          url: item.url,
          updatedAt: null,
        }))
      : [];
    return { text, sources };
  }
}
