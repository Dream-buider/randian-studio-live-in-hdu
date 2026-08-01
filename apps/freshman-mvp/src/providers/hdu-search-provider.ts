import type { SourceRef } from '../domain/models.js';
import type {
  SearchLead,
  SearchProvider,
  WebSearchResult,
} from './contracts.js';

const APPROVED_GUIDE_HOST = 'rcncolp2ehkb.feishu.cn';
const VERIFIED_CLUB_SOURCES: readonly SearchLead[] = [
  {
    title: '杭州电子科技大学2025年学生社团科技文化节举行',
    url: 'https://www.hdu.edu.cn/news/2025/0610/c7517a279705/page.htm',
    snippet: '学校官方报道展示了学生科技类社团的创新活动；活动旨在促进科技创新、普及科学知识并培养跨学科合作精神。具体社团与活动安排以校方最新通知为准。',
    engines: ['verified-official-fallback'],
    retrievedAt: '2026-08-02T00:00:00.000Z',
  },
  {
    title: '杭州电子科技大学校团委',
    url: 'https://tuanwei.hdu.edu.cn/',
    snippet: '杭州电子科技大学校团委官方网站，设有校园活动、科技创新、通知公告和资料下载等栏目；具体社团信息请以网站可见的最新通知为准。',
    engines: ['verified-official-fallback'],
    retrievedAt: '2026-08-02T00:00:00.000Z',
  },
  {
    title: '杭州电子科技大学信息公开 · 学生管理服务信息',
    url: 'https://xxgk.hdu.edu.cn/8797/list.htm',
    snippet: '学校信息公开栏目包含学生社团管理制度入口；具体规定以页面可见的最新文件为准。',
    engines: ['verified-official-fallback'],
    retrievedAt: '2026-08-02T00:00:00.000Z',
  },
];

function verifiedTopicFallback(question: string): SearchLead[] {
  return /社团|学生组织|招新/u.test(question)
    ? VERIFIED_CLUB_SOURCES.map((lead) => ({ ...lead, engines: [...lead.engines] }))
    : [];
}

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

    const leads = tiers.flat().slice(0, this.maxResults);
    return {
      status: 'available',
      leads: leads.length > 0
        ? leads
        : verifiedTopicFallback(question).slice(0, this.maxResults),
    };
  }
}
