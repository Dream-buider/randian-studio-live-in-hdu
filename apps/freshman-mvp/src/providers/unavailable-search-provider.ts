import type { SearchProvider, WebSearchResult } from './contracts.js';

export class UnavailableSearchProvider implements SearchProvider {
  async search(_question: string): Promise<WebSearchResult> {
    return { status: 'not-configured', leads: [] };
  }
}
