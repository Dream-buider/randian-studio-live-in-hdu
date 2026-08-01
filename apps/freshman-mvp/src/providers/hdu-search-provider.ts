import type { SourceRef } from '../domain/models.js';
import type {
  SearchLead,
  SearchProvider,
  WebSearchResult,
} from './contracts.js';

const APPROVED_GUIDE_HOST = 'rcncolp2ehkb.feishu.cn';

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase().replace(/\.$/u, '');
  } catch {
    return null;
  }
}

export function isHduOfficialUrl(url: string): boolean {
  const hostname = hostnameFromUrl(url);
  return hostname === 'hdu.edu.cn' || hostname?.endsWith('.hdu.edu.cn') === true;
}

export function sourceFromSearchLead(lead: SearchLead): SourceRef {
  const url = lead.url.trim();
  return {
    type: isHduOfficialUrl(url) ? 'official' : 'web',
    title: lead.title.trim(),
    url,
    updatedAt: null,
  };
}

function resultTier(lead: SearchLead): 0 | 1 | 2 {
  if (isHduOfficialUrl(lead.url)) {
    return 0;
  }
  return hostnameFromUrl(lead.url) === APPROVED_GUIDE_HOST ? 1 : 2;
}

export class HduFirstSearchProvider implements SearchProvider {
  private readonly inner: SearchProvider;
  private readonly maxResults: number;

  constructor(inner: SearchProvider, maxResults = 6) {
    this.inner = inner;
    this.maxResults = Math.max(1, Math.min(maxResults, 6));
  }

  async search(question: string): Promise<WebSearchResult> {
    const queries = [
      `site:hdu.edu.cn ${question}`,
      `杭州电子科技大学 ${question}`,
    ];
    const results: WebSearchResult[] = [];
    for (const query of queries) {
      try {
        results.push(await this.inner.search(query));
      } catch {
        results.push({ status: 'temporarily-unavailable', leads: [] });
      }
    }

    const available = results.some((result) => result.status === 'available');
    if (!available) {
      return {
        status: results[0]?.status ?? 'temporarily-unavailable',
        leads: [],
      };
    }

    const seen = new Set<string>();
    const tiers: [SearchLead[], SearchLead[], SearchLead[]] = [[], [], []];
    for (const result of results) {
      if (result.status !== 'available') {
        continue;
      }
      for (const lead of result.leads) {
        if (seen.has(lead.url)) {
          continue;
        }
        seen.add(lead.url);
        tiers[resultTier(lead)].push(lead);
      }
    }

    return {
      status: 'available',
      leads: tiers.flat().slice(0, this.maxResults),
    };
  }
}
