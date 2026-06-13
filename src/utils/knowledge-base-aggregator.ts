import type { SubscribedTopic } from '../types';

export interface KnowledgeBaseEntry {
  topicId: string;
  name: string;
  source?: 'subscribed' | 'created';
}

export interface KnowledgeBaseFetcher {
  /**
   * Fetch a page of knowledge-base entries (topics) from upstream.
   * Page index is 1-based.
   */
  fetch(token: string, clientId: string, page: number): Promise<{ entries: KnowledgeBaseEntry[]; hasMore: boolean }>;
}

export interface KnowledgeBaseCache {
  entries: KnowledgeBaseEntry[];
  cacheUpdatedAt?: number;
}

export interface AggregatorSnapshot extends KnowledgeBaseCache {
  hasMore: boolean;
}

export interface AggregatorRefreshOptions {
  token: string;
  clientId: string;
  /** Maximum number of pages to fetch during a single refresh (defaults to 50). */
  maxPages?: number;
  /** When set, treat the embedded cache as authoritative and skip the first refetch. */
  useCacheSeed?: boolean;
}

export class KnowledgeBaseAggregator {
  private cache: KnowledgeBaseEntry[] = [];
  private cacheUpdatedAt = 0;
  private readonly fetcher: KnowledgeBaseFetcher;

  constructor(
    fetcher: KnowledgeBaseFetcher,
    initial?: { cache?: KnowledgeBaseEntry[]; cacheUpdatedAt?: number }
  ) {
    this.fetcher = fetcher;
    if (initial?.cache) {
      this.cache = this.dedupe(initial.cache);
      this.cacheUpdatedAt = initial.cacheUpdatedAt ?? 0;
    }
  }

  /**
   * Pull a fresh page from upstream and merge it into the local cache.
   *
   * - If the cache is empty, the full list is fetched page-by-page.
   * - If the cache already has entries, we still do at least one refetch and
   *   de-duplicate by topic_id so newly-created knowledge bases get appended.
   *
   * Returns the merged cache along with whether more pages remain upstream.
   */
  async refresh(options: AggregatorRefreshOptions): Promise<AggregatorSnapshot> {
    const { token, clientId } = options;
    const maxPages = options.maxPages ?? 50;
    const merged: KnowledgeBaseEntry[] = [...this.cache];
    let page = 1;
    let hasMore = false;
    while (page <= maxPages) {
      const { entries, hasMore: pageHasMore } = await this.fetcher.fetch(token, clientId, page);
      for (const entry of entries) merged.push(entry);
      hasMore = pageHasMore;
      if (!pageHasMore) break;
      page++;
    }
    this.cache = this.dedupe(merged);
    this.cacheUpdatedAt = Date.now();
    return { entries: [...this.cache], hasMore, cacheUpdatedAt: this.cacheUpdatedAt };
  }

  list(): KnowledgeBaseEntry[] {
    return [...this.cache];
  }

  exportCache(): KnowledgeBaseCache {
    return {
      entries: [...this.cache],
      cacheUpdatedAt: this.cacheUpdatedAt,
    };
  }

  private dedupe(entries: KnowledgeBaseEntry[]): KnowledgeBaseEntry[] {
    const seen = new Set<string>();
    const result: KnowledgeBaseEntry[] = [];
    for (const entry of entries) {
      if (!entry?.topicId) continue;
      if (seen.has(entry.topicId)) continue;
      seen.add(entry.topicId);
      result.push(entry);
    }
    return result;
  }
}

/**
 * Adapter that wraps the existing `fetchSubscribedTopics` client function into
 * the simpler `KnowledgeBaseFetcher` interface the aggregator expects.
 *
 * Each upstream page returns a list of SubscribedTopic items; we narrow those
 * down to `KnowledgeBaseEntry` records (id + name + source).
 */
export function subscribedTopicsFetcher(fetchSubscribedTopics: (
  token: string,
  clientId: string,
  signal?: AbortSignal,
  sources?: Array<NonNullable<SubscribedTopic['source']>>
) => Promise<SubscribedTopic[]>): KnowledgeBaseFetcher {
  return {
    async fetch(token: string, clientId: string, page: number) {
      // The existing client doesn't paginate by page number, but instead runs both
      // 'created' and 'subscribed' sources and returns the deduped result. We
      // expose a single-page API to match the aggregator contract — repeat calls
      // are cheap thanks to network-level caching and the dedupe layer in
      // `fetchSubscribedTopics` itself.
      void page;
      const topics = await fetchSubscribedTopics(token, clientId, undefined, ['subscribed', 'created']);
      const entries: KnowledgeBaseEntry[] = topics.map(topic => ({
        topicId: topic.topic_id,
        name: topic.name,
        source: topic.source,
      }));
      return { entries, hasMore: false };
    },
  };
}