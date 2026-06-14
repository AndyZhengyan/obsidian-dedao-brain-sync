import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  KnowledgeBaseAggregator,
  type KnowledgeBaseEntry,
  type KnowledgeBaseFetcher,
} from '../src/utils/knowledge-base-aggregator';

function makeEntry(overrides: Partial<KnowledgeBaseEntry> = {}): KnowledgeBaseEntry {
  return {
    topicId: 'kb-1',
    name: '默认知识库',
    source: 'subscribed',
    ...overrides,
  };
}

function makeFetcher(entriesByPage: KnowledgeBaseEntry[][]): KnowledgeBaseFetcher & { calls: number } {
  const fetcher = {
    calls: 0,
    async fetch(_token: string, _clientId: string, page: number) {
      fetcher.calls++;
      if (page - 1 < entriesByPage.length) {
        return { entries: entriesByPage[page - 1], hasMore: page < entriesByPage.length };
      }
      return { entries: [], hasMore: false };
    },
  };
  return fetcher;
}

describe('KnowledgeBaseAggregator', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('空缓存时全量拉取并按 topic_id 去重', async () => {
    const fetcher = makeFetcher([
      [makeEntry({ topicId: 'kb-1' }), makeEntry({ topicId: 'kb-2' })],
      [makeEntry({ topicId: 'kb-3' })],
    ]);
    const aggregator = new KnowledgeBaseAggregator(fetcher);

    const result = await aggregator.refresh({ token: 't', clientId: 'c' });

    expect(result.entries.map(e => e.topicId)).toEqual(['kb-1', 'kb-2', 'kb-3']);
    expect(result.hasMore).toBe(false);
    expect(fetcher.calls).toBe(2);
  });

  it('本地缓存非空时增量追加新分页并去重', async () => {
    const fetcher = makeFetcher([
      [makeEntry({ topicId: 'kb-3', name: '第三个' })],
    ]);
    const aggregator = new KnowledgeBaseAggregator(fetcher, {
      cache: [
        makeEntry({ topicId: 'kb-1', name: '第一个' }),
        makeEntry({ topicId: 'kb-2', name: '第二个' }),
      ],
      cacheUpdatedAt: Date.now() - 60_000,
    });

    const result = await aggregator.refresh({ token: 't', clientId: 'c' });

    expect(result.entries.map(e => e.topicId)).toEqual(['kb-1', 'kb-2', 'kb-3']);
    expect(result.cacheUpdatedAt).toBeGreaterThan(0);
  });

  it('增量拉新时不重复已有 topic_id', async () => {
    const fetcher = makeFetcher([
      [makeEntry({ topicId: 'kb-1' }), makeEntry({ topicId: 'kb-3' })],
    ]);
    const aggregator = new KnowledgeBaseAggregator(fetcher, {
      cache: [
        makeEntry({ topicId: 'kb-1' }),
        makeEntry({ topicId: 'kb-2' }),
      ],
      cacheUpdatedAt: Date.now(),
    });

    const result = await aggregator.refresh({ token: 't', clientId: 'c' });

    const ids = result.entries.map(e => e.topicId);
    expect(ids.filter(id => id === 'kb-1')).toHaveLength(1);
    expect(ids).toEqual(['kb-1', 'kb-2', 'kb-3']);
  });

  it('列出缓存中的全部条目', async () => {
    const aggregator = new KnowledgeBaseAggregator(makeFetcher([[]]), {
      cache: [makeEntry({ topicId: 'kb-1' }), makeEntry({ topicId: 'kb-2' })],
    });

    const list = aggregator.list();
    expect(list.map(e => e.topicId)).toEqual(['kb-1', 'kb-2']);
  });

  it('将缓存导出为可序列化对象', async () => {
    const aggregator = new KnowledgeBaseAggregator(makeFetcher([[]]), {
      cache: [makeEntry({ topicId: 'kb-1' }), makeEntry({ topicId: 'kb-2' })],
      cacheUpdatedAt: 1234,
    });

    const snapshot = aggregator.exportCache();
    expect(snapshot.entries).toHaveLength(2);
    expect(snapshot.cacheUpdatedAt).toBe(1234);
  });

  it('空缓存 + 网络零结果 → 返回空数组', async () => {
    const fetcher = makeFetcher([[]]);
    const aggregator = new KnowledgeBaseAggregator(fetcher);

    const result = await aggregator.refresh({ token: 't', clientId: 'c' });

    expect(result.entries).toEqual([]);
    expect(result.hasMore).toBe(false);
  });

  it('空 token 调 refresh 抛 MISSING_CREDENTIALS，fetcher 不被调用', async () => {
    const fetcher = makeFetcher([[makeEntry()]]);
    const aggregator = new KnowledgeBaseAggregator(fetcher);

    await expect(aggregator.refresh({ token: '', clientId: '' })).rejects.toThrow('MISSING_CREDENTIALS');
    expect(fetcher.calls).toBe(0);
  });
});

describe('KnowledgeBaseAggregator — empty credentials gating', () => {
  it('空 token 时不调用 fetcher', async () => {
    const fetcher = makeFetcher([[makeEntry()]]);
    const aggregator = new KnowledgeBaseAggregator(fetcher);

    await expect(aggregator.refresh({ token: '', clientId: 'c' })).rejects.toThrow('MISSING_CREDENTIALS');
    expect(fetcher.calls).toBe(0);
  });

  it('非空 token 正常调 fetcher', async () => {
    const fetcher = makeFetcher([[makeEntry()]]);
    const aggregator = new KnowledgeBaseAggregator(fetcher);

    const result = await aggregator.refresh({ token: 'real-token', clientId: 'real-client' });
    expect(result.entries).toHaveLength(1);
    expect(fetcher.calls).toBe(1);
  });
});