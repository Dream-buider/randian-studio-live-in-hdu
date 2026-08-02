import type {
  ProviderStatus,
  SearchLead,
  SearchProvider,
  WebSearchResult,
} from './contracts.js';

interface SearxngProviderOptions {
  baseUrl: string;
  fetch?: typeof globalThis.fetch;
  timeoutMs?: number;
  maxResults?: number;
  now?: () => Date;
}

type SearxngResult = {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  snippet?: unknown;
  engines?: unknown;
};

function isPrivateIpv4(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (
    octets.length !== 4
    || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)
  ) {
    return false;
  }
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168);
}

function safePublicUrl(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (
    !['http:', 'https:'].includes(parsed.protocol)
    || parsed.username.length > 0
    || parsed.password.length > 0
  ) {
    return null;
  }
  const hostname = parsed.hostname.toLowerCase().replace(/\.$/u, '');
  const compactIpv6 = hostname.replace(/^\[|\]$/gu, '');
  if (
    hostname === 'localhost'
    || compactIpv6 === '::1'
    || compactIpv6.startsWith('fc')
    || compactIpv6.startsWith('fd')
    || compactIpv6.startsWith('fe8')
    || compactIpv6.startsWith('fe9')
    || compactIpv6.startsWith('fea')
    || compactIpv6.startsWith('feb')
    || hostname.endsWith('.localhost')
    || hostname.endsWith('.local')
    || isPrivateIpv4(hostname)
  ) {
    return null;
  }
  return parsed.href;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

export class SearxngProvider implements SearchProvider {
  private readonly baseUrl: string;
  private readonly fetch: typeof globalThis.fetch;
  private readonly timeoutMs: number;
  private readonly maxResults: number;
  private readonly now: () => Date;
  private readonly configurationStatus: 'configured' | 'configuration-error';
  private lastSearchStatus: 'never' | ProviderStatus = 'never';
  private lastSearchAt: string | null = null;

  constructor(options: SearxngProviderOptions) {
    this.baseUrl = options.baseUrl.trim();
    this.fetch = options.fetch ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxResults = Math.max(1, Math.min(options.maxResults ?? 6, 6));
    this.now = options.now ?? (() => new Date());
    try {
      const configured = new URL(
        '/search',
        this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`,
      );
      this.configurationStatus = (
        this.baseUrl.length > 0
        && ['http:', 'https:'].includes(configured.protocol)
      )
        ? 'configured'
        : 'configuration-error';
    } catch {
      this.configurationStatus = 'configuration-error';
    }
  }

  status(): {
    status: 'configured' | 'configuration-error';
    lastSearchStatus: 'never' | ProviderStatus;
    lastSearchAt: string | null;
  } {
    return {
      status: this.configurationStatus,
      lastSearchStatus: this.lastSearchStatus,
      lastSearchAt: this.lastSearchAt,
    };
  }

  private result(
    status: ProviderStatus,
    leads: SearchLead[] = [],
    attempted = true,
  ): WebSearchResult {
    this.lastSearchStatus = status;
    this.lastSearchAt = attempted ? this.now().toISOString() : null;
    return { status, leads };
  }

  async search(question: string): Promise<WebSearchResult> {
    if (this.configurationStatus !== 'configured') {
      return this.result('configuration-error', [], false);
    }
    let endpoint: URL;
    try {
      endpoint = new URL('/search', this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`);
    } catch {
      return this.result('configuration-error', [], false);
    }
    if (!['http:', 'https:'].includes(endpoint.protocol)) {
      return this.result('configuration-error', [], false);
    }
    endpoint.searchParams.set('q', question);
    endpoint.searchParams.set('format', 'json');
    endpoint.searchParams.set('language', 'zh-CN');
    endpoint.searchParams.set('safesearch', '1');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetch(endpoint, { signal: controller.signal });
      if (!response.ok) {
        return this.result('temporarily-unavailable');
      }
      const body = await response.json() as { results?: unknown };
      if (!Array.isArray(body.results)) {
        return this.result('temporarily-unavailable');
      }
      const retrievedAt = this.now().toISOString();
      const seen = new Set<string>();
      const leads: SearchLead[] = [];
      for (const raw of body.results as SearxngResult[]) {
        const title = typeof raw?.title === 'string' ? raw.title.trim() : '';
        const rawUrl = typeof raw?.url === 'string' ? raw.url.trim() : '';
        const url = safePublicUrl(rawUrl);
        if (title.length === 0 || url === null || seen.has(url)) {
          continue;
        }
        seen.add(url);
        leads.push({
          title,
          url,
          snippet: typeof raw.content === 'string'
            ? raw.content.trim()
            : typeof raw.snippet === 'string'
              ? raw.snippet.trim()
              : '',
          engines: stringList(raw.engines),
          retrievedAt,
        });
        if (leads.length >= this.maxResults) {
          break;
        }
      }
      return this.result('available', leads);
    } catch {
      return this.result('temporarily-unavailable');
    } finally {
      clearTimeout(timeout);
    }
  }
}
