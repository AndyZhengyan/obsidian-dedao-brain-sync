import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { KnowledgeBaseSelect } from '../src/ui/knowledge-base-select';

vi.mock('../src/api', () => ({
  fetchSubscribedTopics: vi.fn(),
}));

import { fetchSubscribedTopics } from '../src/api';

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
});
