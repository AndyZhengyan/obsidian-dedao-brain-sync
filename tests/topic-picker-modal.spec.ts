import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopicPickerModal } from '../src/ui/topic-picker-modal';
import { fetchSubscribedTopics, fetchTopicContentPreviews } from '../src/api';

vi.mock('../src/api', () => ({
  fetchSubscribedTopics: vi.fn(),
  fetchTopicContentPreviews: vi.fn(),
}));

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

describe('TopicPickerModal', () => {
  afterEach(() => {
    render(null, document.body);
    vi.clearAllMocks();
  });

  it('keeps subscribed topics and topic contents in separate levels', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
      { topic_id: 'guide', name: 'Get 笔记使用指南' },
    ]);
    vi.mocked(fetchTopicContentPreviews).mockResolvedValue([
      {
        note_id: 'note-1',
        title: '第一篇内容',
        updated_at: '2026-06-01T10:00:00+08:00',
        blogger_name: '罗振宇',
      },
    ]);

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(TopicPickerModal, {
          token: 'token',
          clientId: 'client',
          authMode: 'openapi',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
        container
      );
      await Promise.resolve();
    });
    await flush();

    expect(container.textContent).toContain('罗振宇学习笔记');
    expect(container.textContent).toContain('Get 笔记使用指南');
    expect(container.textContent).not.toContain('第一篇内容');
    expect(fetchTopicContentPreviews).not.toHaveBeenCalled();

    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    expect(fetchTopicContentPreviews).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('罗振宇学习笔记');
    expect(container.textContent).toContain('第一篇内容');
    expect(container.textContent).not.toContain('Get 笔记使用指南');

    await act(async () => {
      (container.querySelector('[data-topic-back]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('Get 笔记使用指南');
    expect(container.textContent).not.toContain('第一篇内容');
  });
});
