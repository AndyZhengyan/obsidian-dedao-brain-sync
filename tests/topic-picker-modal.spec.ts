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
      { bloggerIndex: 0, page: 2 },
      undefined
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

  it('only auto-selects newly loaded contents that match the active filters', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([{ topic_id: 'luo', name: '罗振宇学习笔记' }]);
    vi.mocked(fetchTopicContentPreviewPage)
      .mockResolvedValueOnce({
        items: [{ note_id: 'note-1', title: 'AI 第一篇', updated_at: '2026-06-01T10:00:00+08:00', blogger_name: '罗振宇' }],
        nextCursor: { bloggerIndex: 0, page: 2 },
      })
      .mockResolvedValueOnce({
        items: [
          { note_id: 'note-2', title: 'AI 第二篇', updated_at: '2026-06-01T11:00:00+08:00', blogger_name: '罗振宇' },
          { note_id: 'note-3', title: '管理文章', updated_at: '2026-06-01T12:00:00+08:00', blogger_name: '罗振宇' },
        ],
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
      const search = container.querySelector('[data-topic-search]') as HTMLInputElement;
      search.value = 'AI';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => {
      (container.querySelector('[data-topic-select-all]') as HTMLButtonElement).click();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-load-more]') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('已选 2 个');
    expect(container.textContent).not.toContain('管理文章');
  });

  it('stops auto-selecting newly loaded contents after a tag chip changes the filter', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([{ topic_id: 'luo', name: '罗振宇学习笔记' }]);
    vi.mocked(fetchTopicContentPreviewPage)
      .mockResolvedValueOnce({
        items: [{
          note_id: 'note-1',
          title: 'AI 第一篇',
          updated_at: '2026-06-01T10:00:00+08:00',
          tags: [{ name: 'AI' }],
        }],
        nextCursor: { bloggerIndex: 0, page: 2 },
      })
      .mockResolvedValueOnce({
        items: [{
          note_id: 'note-2',
          title: 'AI 第二篇',
          updated_at: '2026-06-01T11:00:00+08:00',
          tags: [{ name: 'AI' }],
        }],
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
      (container.querySelector('[data-tag-name="AI"]') as HTMLButtonElement).click();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-load-more]') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('已选 1 个');
    expect(Array.from(container.querySelectorAll('input[type="checkbox"]'))
      .filter(input => (input as HTMLInputElement).checked)).toHaveLength(1);
  });

  it('renders topic filters outside the scrollable article list', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([{ topic_id: 'luo', name: '罗振宇学习笔记' }]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [{ note_id: 'note-1', title: '第一篇', updated_at: '2026-06-01T10:00:00+08:00' }],
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

    expect(container.querySelector('.getnote-picker-body > .getnote-topic-filter-bar')).toBeNull();
    expect(container.querySelector('.getnote-picker > .getnote-topic-filter-bar')).not.toBeNull();
  });

  it('resets selection and loaded count when switching knowledge bases', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'first', name: '第一个知识库' },
      { topic_id: 'second', name: '第二个知识库' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockImplementation(async (topicId) => ({
      items: topicId === 'first'
        ? [{ note_id: 'note-1', title: '第一篇', updated_at: '2026-06-01T10:00:00+08:00' }]
        : [
          { note_id: 'note-2', title: '第二篇', updated_at: '2026-06-01T11:00:00+08:00' },
          { note_id: 'note-3', title: '第三篇', updated_at: '2026-06-01T12:00:00+08:00' },
        ],
    }));

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
      (container.querySelector('[data-topic-id="first"]') as HTMLButtonElement).click();
    });
    await flush();
    await act(async () => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
      (container.querySelector('[data-topic-back]') as HTMLButtonElement).click();
    });
    await act(async () => {
      (container.querySelector('[data-topic-id="second"]') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.textContent).toContain('已选 0 个');
    expect(container.textContent).toContain('已加载 2 条');
    expect(container.textContent).not.toContain('已加载 3 条');
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

  it('confirms the active knowledge base as an all-content sync without selecting loaded notes', async () => {
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
          topic_id: 'luo',
        },
      ],
      nextCursor: { bloggerIndex: 0, page: 2 },
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

    const allScope = container.querySelector('[data-topic-scope-all]') as HTMLInputElement;
    expect(allScope).toBeTruthy();
    await act(async () => {
      allScope.click();
    });

    expect(container.textContent).toContain('同步该知识库的全部内容');
    expect(container.textContent).toContain('将同步全部内容');
    expect(container.querySelector('[data-topic-select-all]')).toBeNull();
    expect((container.querySelector('.mod-cta') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => {
      (container.querySelector('.mod-cta') as HTMLButtonElement).click();
    });

    expect(onConfirm).toHaveBeenCalledWith({
      syncAll: true,
      topicIds: ['luo'],
      knowledgeBaseName: '罗振宇学习笔记',
    });
  });

  it('allows all-content sync when the knowledge-base preview is empty', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'empty', name: '待完整同步的知识库' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({ items: [] });

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
      (container.querySelector('[data-topic-id="empty"]') as HTMLButtonElement).click();
    });
    await flush();

    expect(container.querySelector('[data-topic-scope-all]')).not.toBeNull();
  });

  it('disables all-content confirmation after returning to the knowledge-base list', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({ items: [] });

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
      (container.querySelector('[data-topic-scope-all]') as HTMLInputElement).click();
      (container.querySelector('[data-topic-back]') as HTMLButtonElement).click();
    });

    expect(container.textContent).not.toContain('将同步全部内容');
    expect((container.querySelector('.mod-cta') as HTMLButtonElement).disabled).toBe(true);
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

describe('TopicPickerModal card layout (#138)', () => {
  it('renders knowledge-base contents as cards with title, summary, preview, tags and timestamp', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        {
          note_id: 'kb-card-1',
          title: 'AI 知识库卡片化测试',
          updated_at: '2026-06-10T15:30:00+08:00',
          blogger_name: '罗振宇',
          topic_id: 'luo',
          summary: '这是一段 AI 生成的摘要，用于验证卡片显示摘要区域。',
          content: '这是与摘要不同的正文预览内容。',
        } as never,
      ],
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
      await Promise.resolve();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    const card = container.querySelector('.getnote-note-card');
    expect(card).not.toBeNull();

    expect(card!.querySelector('.getnote-note-card-title')).not.toBeNull();
    expect(card!.querySelector('.getnote-note-card-summary')?.textContent).toContain('AI 生成的摘要');
    expect(card!.querySelector('.getnote-note-card-preview')?.textContent).toContain('与摘要不同的正文预览');
    expect(card!.querySelector('.getnote-note-card-time')).not.toBeNull();
  });

  it('hides the summary when knowledge-base summary and content are the same', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        {
          note_id: 'kb-card-duplicate',
          title: '重复摘要测试',
          updated_at: '2026-06-10T15:30:00+08:00',
          topic_id: 'luo',
          summary: '同一段内容',
          content: '同一段内容',
        } as never,
      ],
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
      await Promise.resolve();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    const card = container.querySelector('.getnote-note-card');
    expect(card!.querySelector('.getnote-note-card-summary')).toBeNull();
    expect(card!.querySelector('.getnote-note-card-preview')?.textContent).toContain('同一段内容');
  });

  it('uses cached tag options together with tags from the active knowledge-base contents', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        {
          note_id: 'kb-card-tags',
          title: '标签合并测试',
          updated_at: '2026-06-10T15:30:00+08:00',
          topic_id: 'luo',
          content: '正文',
          tags: [{ name: 'active-tag' }],
        } as never,
      ],
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(h(TopicPickerModal, {
        token: 'token',
        clientId: 'client',
        authMode: 'openapi',
        tagOptions: ['cached-tag'],
        onConfirm: vi.fn(),
        onCancel: vi.fn(),
      }), container);
      await Promise.resolve();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    const tagTrigger = container.querySelector('.getnote-tag-select-trigger') as HTMLButtonElement;
    expect(tagTrigger).toBeTruthy();
    await act(() => {
      tagTrigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.textContent).toContain('cached-tag');
    expect(container.textContent).toContain('active-tag');
  });

  it('renders multiple knowledge-base contents as a single-column vertical stack of cards', async () => {
    vi.mocked(fetchSubscribedTopics).mockResolvedValue([
      { topic_id: 'luo', name: '罗振宇学习笔记' },
    ]);
    vi.mocked(fetchTopicContentPreviewPage).mockResolvedValue({
      items: [
        { note_id: 'kb-1', title: '内容 1', updated_at: '2026-06-01T10:00:00+08:00', topic_id: 'luo' },
        { note_id: 'kb-2', title: '内容 2', updated_at: '2026-06-02T10:00:00+08:00', topic_id: 'luo' },
        { note_id: 'kb-3', title: '内容 3', updated_at: '2026-06-03T10:00:00+08:00', topic_id: 'luo' },
      ],
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
      await Promise.resolve();
    });
    await flush();
    await act(async () => {
      (container.querySelector('[data-topic-id="luo"]') as HTMLButtonElement).click();
    });
    await flush();

    const cards = Array.from(container.querySelectorAll('.getnote-note-card'));
    expect(cards.length).toBe(3);
  });
});
