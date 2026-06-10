import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TopicPickerModal } from '../src/ui/topic-picker-modal';
import { fetchSubscribedTopics, fetchTopicContentPreviewPage } from '../src/api';

vi.mock('../src/api', () => ({
  fetchSubscribedTopics: vi.fn(),
  fetchTopicContentPreviewPage: vi.fn(),
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
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        {
          note_id: 'note-1',
          title: '第一篇内容',
          updated_at: '2026-06-01T10:00:00+08:00',
          blogger_name: '罗振宇',
        },
      ],
      nextCursor: { bloggerIndex: 0, page: 2 },
    });

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
    expect(fetchTopicContentPreviewPage).not.toHaveBeenCalled();

    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    expect(fetchTopicContentPreviewPage).toHaveBeenCalledTimes(1);
    expect(fetchTopicContentPreviewPage).toHaveBeenCalledWith(
      'luo',
      '罗振宇学习笔记',
      'token',
      'client',
      'openapi',
      undefined,
      undefined
    );
    expect(container.textContent).toContain('罗振宇学习笔记');
    expect(container.textContent).toContain('第一篇内容');
    expect(container.textContent).not.toContain('Get 笔记使用指南');
    expect(container.textContent).toContain('加载更多');
    expect(container.textContent).toContain('同步');
    expect(container.textContent).not.toContain('同步专题');

    await act(async () => {
      (container.querySelector('[data-topic-back]') as HTMLButtonElement).click();
    });

    expect(container.textContent).toContain('Get 笔记使用指南');
    expect(container.textContent).not.toContain('第一篇内容');
  });

  it('loads more topic contents one page at a time', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage)
      .mockResolvedValueOnce({
        items: [
          { note_id: 'note-1', title: '第一页内容', updated_at: '2026-06-01T10:00:00+08:00' },
        ],
        nextCursor: { bloggerIndex: 0, page: 2 },
      })
      .mockResolvedValueOnce({
        items: [
          { note_id: 'note-2', title: '第二页内容', updated_at: '2026-06-01T11:00:00+08:00' },
        ],
      });

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

    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('第一页内容');
    expect(container.textContent).toContain('加载更多');

    await act(async () => {
      (container.querySelector('[data-topic-load-more]') as HTMLButtonElement).click();
    });
    await flush();

    expect(fetchTopicContentPreviewPage).toHaveBeenLastCalledWith(
      'luo',
      '罗振宇学习笔记',
      'token',
      'client',
      'openapi',
      undefined,
      { bloggerIndex: 0, page: 2 }
    );
    expect(container.textContent).toContain('第一页内容');
    expect(container.textContent).toContain('第二页内容');
    expect(container.textContent).not.toContain('加载更多');
  });

  it('keeps newly loaded contents selected after selecting all', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage)
      .mockResolvedValueOnce({
        items: [{ note_id: 'note-1', title: '第一页内容', updated_at: '2026-06-01T10:00:00+08:00' }],
        nextCursor: { bloggerIndex: 0, page: 2 },
      })
      .mockResolvedValueOnce({
        items: [{ note_id: 'note-2', title: '第二页内容', updated_at: '2026-06-01T11:00:00+08:00' }],
      });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(h(TopicPickerModal, {
        token: 'token',
        clientId: 'client',
        authMode: 'openapi',
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }), container);
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-select-all]') as HTMLButtonElement).click();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-load-more]') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('已选 2 个');
    expect(Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .every(input => (input as HTMLInputElement).checked)).toBe(true);
  });

  it('searches, filters by blogger, and selects all visible topic contents', async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        { note_id: 'note-1', title: 'AI 第一篇', updated_at: '2026-06-01T10:00:00+08:00', blogger_name: '罗振宇', topic_id: 'luo' },
        { note_id: 'note-2', title: 'AI 第二篇', updated_at: '2026-06-01T11:00:00+08:00', blogger_name: '脱不花', topic_id: 'luo' },
        { note_id: 'note-3', title: '管理文章', updated_at: '2026-06-01T12:00:00+08:00', blogger_name: '罗振宇', topic_id: 'luo' },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(h(TopicPickerModal, {
        token: 'token',
        clientId: 'client',
        authMode: 'openapi',
        onConfirm,
        onCancel: vi.fn(),
      }), container);
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    const search = container.querySelector('[data-topic-search]') as HTMLInputElement;
    await act(async () => {
      search.value = 'AI';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    const filter = container.querySelector('[data-topic-blogger-filter]') as HTMLSelectElement;
    await act(async () => {
      filter.value = '罗振宇';
      filter.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(container.textContent).toContain('AI 第一篇');
    expect(container.textContent).not.toContain('AI 第二篇');
    expect(container.textContent).not.toContain('管理文章');

    await act(async () => {
      (container.querySelector('[data-topic-select-all]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('已选 1 个');

    await act(async () => {
      (container.querySelector('[data-topic-select-none]') as HTMLButtonElement).click();
    });
    expect(container.textContent).toContain('已选 0 个');
  });

  it('confirms selected note ids with topic and blogger scope', async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        {
          note_id: 'blogger_note-1',
          title: '第一篇内容',
          updated_at: '2026-06-01T10:00:00+08:00',
          blogger_name: '罗振宇',
          topic_id: 'luo',
          blogger_id: 'follow_luo',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(TopicPickerModal, {
          token: 'token',
          clientId: 'client',
          authMode: 'openapi',
          onConfirm,
          onCancel: vi.fn(),
        }),
        container
      );
      await Promise.resolve();
    });
    await flush();

    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    await act(async () => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });

    await act(async () => {
      (container.querySelector('.mod-cta') as HTMLButtonElement).click();
    });

    expect(onConfirm).toHaveBeenCalledWith({
      selectedNoteIds: ['blogger_note-1'],
      topicIds: ['luo'],
      bloggerIds: ['follow_luo'],
      knowledgeBaseNames: {
        'blogger_note-1': '罗振宇学习笔记',
      },
    });
  });

  it('falls back to the active topic when selected content has no topic metadata', async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        {
          note_id: 'blogger_note-1',
          title: '第一篇内容',
          updated_at: '2026-06-01T10:00:00+08:00',
          blogger_name: '罗振宇',
        },
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(TopicPickerModal, {
          token: 'token',
          clientId: 'client',
          authMode: 'openapi',
          onConfirm,
          onCancel: vi.fn(),
        }),
        container
      );
      await Promise.resolve();
    });
    await flush();

    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    await act(async () => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });

    await act(async () => {
      (container.querySelector('.mod-cta') as HTMLButtonElement).click();
    });

    expect(onConfirm).toHaveBeenCalledWith({
      selectedNoteIds: ['blogger_note-1'],
      topicIds: ['luo'],
      knowledgeBaseNames: {
        'blogger_note-1': '罗振宇学习笔记',
      },
    });
  });
});
