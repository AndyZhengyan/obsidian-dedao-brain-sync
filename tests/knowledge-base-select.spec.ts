import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { KnowledgeBaseSelect } from '../src/ui/knowledge-base-select';

vi.mock('../src/api', () => ({
  fetchSubscribedTopics: vi.fn(),
}));

import { fetchSubscribedTopics } from '../src/api';

function deferredTopics() {
  let resolve!: (value: Array<{ topic_id: string; name: string; source: 'created' | 'subscribed' }>) => void;
  const promise = new Promise<Array<{ topic_id: string; name: string; source: 'created' | 'subscribed' }>>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function renderSelect(props: Partial<Parameters<typeof KnowledgeBaseSelect>[0]> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const baseProps = {
    value: [],
    onChange: vi.fn(),
    hasCredentials: true,
    token: 'openapi-token',
    clientId: 'openapi-client',
    authMode: 'openapi' as const,
  };

  const rerender = (nextProps: Partial<Parameters<typeof KnowledgeBaseSelect>[0]> = {}) => {
    render(h(KnowledgeBaseSelect, {
      ...baseProps,
      ...props,
      ...nextProps,
    }), container);
  };

  rerender();
  return { container, rerender };
}

async function openDropdown(container: HTMLElement) {
  const trigger = container.querySelector('.getnote-knowledge-base-select-trigger') as HTMLButtonElement;
  expect(trigger).toBeTruthy();
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  render(null, document.body);
  document.body.innerHTML = '';
});

describe('KnowledgeBaseSelect', () => {
  it('uses the latest authMode when refetching after mode switches', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T11:00:00+08:00'));
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([{ topic_id: 'kb-1', name: '知识库 1', source: 'created' }]);

    const { container, rerender } = renderSelect();

    await openDropdown(container);

    expect(fetchSubscribedTopics).toHaveBeenNthCalledWith(1, expect.objectContaining({
      token: 'openapi-token',
      clientId: 'openapi-client',
      authMode: 'openapi',
    }));

    vi.setSystemTime(new Date('2026-07-05T11:06:00+08:00'));
    rerender({
      authMode: 'web',
      token: 'web-token',
      clientId: '',
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(fetchSubscribedTopics).toHaveBeenNthCalledWith(2, expect.objectContaining({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    }));
  });

  it('does not reuse the fresh cache after switching authMode', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T11:00:00+08:00'));
    vi.mocked(fetchSubscribedTopics)
      .mockResolvedValueOnce([{ topic_id: 'openapi-kb', name: 'OpenAPI 知识库', source: 'created' }])
      .mockResolvedValueOnce([{ topic_id: 'web-kb', name: 'Web 知识库', source: 'subscribed' }]);

    const { container, rerender } = renderSelect();

    await openDropdown(container);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('OpenAPI 知识库');
    expect(fetchSubscribedTopics).toHaveBeenCalledTimes(1);

    vi.setSystemTime(new Date('2026-07-05T11:01:00+08:00'));
    await act(async () => {
      rerender({
        authMode: 'web',
        token: 'web-token',
        clientId: '',
      });
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(fetchSubscribedTopics).toHaveBeenNthCalledWith(2, expect.objectContaining({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    }));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Web 知识库');
  });

  it('ignores a stale authMode refresh that resolves after switching back', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-05T11:00:00+08:00'));
    const webRefresh = deferredTopics();
    const openapiRefresh = deferredTopics();
    vi.mocked(fetchSubscribedTopics)
      .mockResolvedValueOnce([{ topic_id: 'openapi-original', name: 'OpenAPI 初始知识库', source: 'created' }])
      .mockReturnValueOnce(webRefresh.promise)
      .mockReturnValueOnce(openapiRefresh.promise);

    const { container, rerender } = renderSelect();

    await openDropdown(container);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('OpenAPI 初始知识库');

    await act(async () => {
      rerender({
        authMode: 'web',
        token: 'web-token',
        clientId: '',
      });
      await Promise.resolve();
    });
    expect(fetchSubscribedTopics).toHaveBeenNthCalledWith(2, expect.objectContaining({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    }));

    await act(async () => {
      rerender({
        authMode: 'openapi',
        token: 'openapi-token',
        clientId: 'openapi-client',
      });
      await Promise.resolve();
    });
    expect(fetchSubscribedTopics).toHaveBeenNthCalledWith(3, expect.objectContaining({
      token: 'openapi-token',
      clientId: 'openapi-client',
      authMode: 'openapi',
    }));

    await act(async () => {
      openapiRefresh.resolve([{ topic_id: 'openapi-latest', name: 'OpenAPI 最新知识库', source: 'created' }]);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('OpenAPI 最新知识库');

    await act(async () => {
      webRefresh.resolve([{ topic_id: 'web-late', name: 'Web 迟到知识库', source: 'subscribed' }]);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('OpenAPI 最新知识库');
    expect(container.textContent).not.toContain('Web 迟到知识库');

    await openDropdown(container);
    await openDropdown(container);
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(container.textContent).toContain('OpenAPI 最新知识库');
    expect(container.textContent).not.toContain('Web 迟到知识库');
  });
});
