import {
  isAnswerResult,
  type AnswerResult,
  type QuestionContext,
} from './api.js';

export const CHAT_SESSION_KEY = 'live-in-hdu:pending-question';

export type ChatRequestStatus = 'pending' | 'in-flight' | 'succeeded' | 'failed';

export interface ChatSessionRequest {
  requestId: string;
  question: string;
  context: QuestionContext;
  status: ChatRequestStatus;
  result: AnswerResult | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isContext(value: unknown): value is QuestionContext {
  return isRecord(value)
    && (value.intentId === null || typeof value.intentId === 'string')
    && typeof value.question === 'string'
    && (value.category === null || typeof value.category === 'string');
}

export function createChatSessionRequest(
  question: string,
  context: QuestionContext,
): ChatSessionRequest {
  return {
    requestId: crypto.randomUUID(),
    question,
    context,
    status: 'pending',
    result: null,
  };
}

export function readChatSessionRequest(): ChatSessionRequest | null {
  const stored = sessionStorage.getItem(CHAT_SESSION_KEY);
  if (!stored) {
    return null;
  }
  let value: unknown;
  try {
    value = JSON.parse(stored) as unknown;
  } catch {
    return null;
  }
  if (
    !isRecord(value)
    || typeof value.requestId !== 'string'
    || value.requestId.trim().length === 0
    || typeof value.question !== 'string'
    || value.question.trim().length === 0
    || !isContext(value.context)
    || !['pending', 'in-flight', 'succeeded', 'failed'].includes(String(value.status))
  ) {
    return null;
  }
  const status = value.status as ChatRequestStatus;
  if (status === 'succeeded' && !isAnswerResult(value.result)) {
    return null;
  }
  return {
    requestId: value.requestId,
    question: value.question,
    context: value.context,
    status,
    result: status === 'succeeded' ? value.result as AnswerResult : null,
  };
}

export function writeChatSessionRequest(request: ChatSessionRequest): void {
  sessionStorage.setItem(CHAT_SESSION_KEY, JSON.stringify(request));
}

export function writeChatSessionRequestIfCurrent(request: ChatSessionRequest): boolean {
  const current = readChatSessionRequest();
  if (current?.requestId !== request.requestId) {
    return false;
  }
  writeChatSessionRequest(request);
  return true;
}
