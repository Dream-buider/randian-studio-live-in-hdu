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

function requestId(): string {
  const webCrypto = globalThis.crypto;
  if (webCrypto && typeof webCrypto.randomUUID === 'function') {
    try {
      return webCrypto.randomUUID();
    } catch {
      // Continue to the lower-capability request-ID paths.
    }
  }
  if (webCrypto && typeof webCrypto.getRandomValues === 'function') {
    try {
      const bytes = new Uint8Array(16);
      webCrypto.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((value) => value.toString(16).padStart(2, '0'));
      return [
        hex.slice(0, 4).join(''),
        hex.slice(4, 6).join(''),
        hex.slice(6, 8).join(''),
        hex.slice(8, 10).join(''),
        hex.slice(10, 16).join(''),
      ].join('-');
    } catch {
      // Request IDs are not credentials; the non-WebCrypto path remains valid.
    }
  }
  const now = Date.now().toString(36);
  const monotonic = typeof globalThis.performance?.now === 'function'
    ? Math.floor(globalThis.performance.now() * 1_000).toString(36)
    : '0';
  const randomPart = () => Math.floor(Math.random() * Number.MAX_SAFE_INTEGER).toString(36);
  return `req-${now}-${monotonic}-${randomPart()}-${randomPart()}`;
}

export function createChatSessionRequest(
  question: string,
  context: QuestionContext,
): ChatSessionRequest {
  return {
    requestId: requestId(),
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
