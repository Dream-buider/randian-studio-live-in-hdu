import type { SearchProvider, SearchResult } from './contracts.js';

export class UnavailableSearchProvider implements SearchProvider {
  async search(_question: string): Promise<SearchResult> {
    return { available: false, items: [] };
  }
}
