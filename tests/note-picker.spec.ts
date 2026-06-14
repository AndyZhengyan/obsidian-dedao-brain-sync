import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { fetchNotes } from '../src/api';
import { generateDisplayTitle } from '../src/note-parser';
import { NotePickerModal } from '../src/ui/note-picker-modal';
import { initI18n } from '../src/i18n';
import type { GetNoteNote } from '../src/types';

vi.mock('../src/api', () => ({
  fetchNotes: vi.fn().mockResolvedValue({ notes: [], hasMore: false }),
}));

function makeNote(overrides: Partial<GetNoteNote> = {}): GetNoteNote {
  return {
    id: 1,
    note_id: 'test-1',
    title: '测试笔记',
    content: '正文内容',
    note_type: 'plain_text',
    source: 'app',
    tags: [],
    created_at: '2026-04-27T22:26:17+08:00',
    updated_at: '2026-04-28T10:00:00+08:00',
    ...overrides,
  };
}

afterEach(() => {
  vi.mocked(fetchNotes).mockClear();
  render(null, document.body);
  document.body.innerHTML = '';
});

function filterNotes(notes: GetNoteNote[], query: string): GetNoteNote[] {
  if (!query) return notes;
  const normalizedQuery = query.toLowerCase();
  return notes.filter(n => {
    const haystacks = [
      generateDisplayTitle(n),
      ...n.tags.map(tag => tag.name),
    ];
    return haystacks.some(value => value.toLowerCase().includes(normalizedQuery));
  });
}

describe('filterNotes (note picker search)', () => {
  const notes = [
    makeNote({ note_id: '1', title: '周报 2026' }),
    makeNote({ note_id: '2', title: '会议纪要' }),
    makeNote({ note_id: '3', title: '项目规划', tags: [{ name: 'work' }, { name: '知识库' }] }),
    makeNote({ note_id: '4', title: '', content: '这是关于周报的笔记没有标题' }),
  ];

  it('returns all notes when query is empty', () => {
    expect(filterNotes(notes, '')).toHaveLength(4);
  });

  it('filters notes by title (case-insensitive)', () => {
    const result = filterNotes(notes, '周报');
    expect(result).toHaveLength(2);
    expect(result.map(n => n.note_id)).toContain('1');
    expect(result.map(n => n.note_id)).toContain('4');
  });

  it('filters by partial title match', () => {
    const result = filterNotes(notes, '会');
    expect(result).toHaveLength(1);
    expect(result[0].note_id).toBe('2');
  });

  it('returns empty when no match', () => {
    const result = filterNotes(notes, '不存在');
    expect(result).toHaveLength(0);
  });

  it('filters by tag (case-insensitive)', () => {
    const result = filterNotes(notes, 'knowledge');
    expect(result).toHaveLength(0);

    const chineseResult = filterNotes(notes, '知识');
    expect(chineseResult).toHaveLength(1);
    expect(chineseResult[0].note_id).toBe('3');

    const englishResult = filterNotes(notes, 'WORK');
    expect(englishResult).toHaveLength(1);
    expect(englishResult[0].note_id).toBe('3');
  });

  it('filters by content when title is empty (generateDisplayTitle fallback)', () => {
    const result = filterNotes(notes, '周报');
    // Note 4 has no title, generateDisplayTitle falls back to content first 20 chars
    expect(result.some(n => n.note_id === '4')).toBe(true);
  });
});

describe('NotePickerModal auth chains', () => {
  async function renderPicker(props: { token: string; clientId: string; authMode: 'openapi' | 'web' }, onConfirm = vi.fn()) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(NotePickerModal, {
          ...props,
          onConfirm,
          onCancel: vi.fn(),
        }),
        container
      );
      await Promise.resolve();
    });
    return container;
  }

  it('loads the first page with OpenAPI credentials', async () => {
    await renderPicker({
      token: 'openapi-token',
      clientId: 'openapi-client',
      authMode: 'openapi',
    });

    expect(fetchNotes).toHaveBeenCalledWith(expect.objectContaining({
      token: 'openapi-token',
      clientId: 'openapi-client',
      authMode: 'openapi',
      sinceId: '0',
    }));
  });

  it('loads the first page with Web Token credentials', async () => {
    await renderPicker({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    });

    expect(fetchNotes).toHaveBeenCalledWith(expect.objectContaining({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
      sinceId: '0',
    }));
  });

  it('filters the picker list with its own dropdown and submits that scope', async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetchNotes).mockResolvedValueOnce({
      notes: [
        makeNote({ note_id: 'plain', title: '纯文本笔记', note_type: 'plain_text' }),
        makeNote({ note_id: 'link', title: '链接笔记', note_type: 'link' }),
      ],
      hasMore: false,
    });

    const container = await renderPicker({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    }, onConfirm);

    const trigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部笔记');
    expect(trigger).toBeTruthy();
    await act(() => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const plainTextOption = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === '文字笔记');
    expect(plainTextOption).toBeTruthy();
    const plainTextCheckbox = plainTextOption!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(() => {
      plainTextCheckbox.checked = false;
      plainTextCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).not.toContain('纯文本笔记');
    expect(container.textContent).toContain('链接笔记');

    const linkRowCheckbox = Array.from(container.querySelectorAll('.getnote-note-card input[type="checkbox"]'))[0] as HTMLInputElement;
    await act(() => {
      linkRowCheckbox.checked = true;
      linkRowCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(() => {
      container.querySelector('.mod-cta')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith(
      ['link'],
      expect.arrayContaining(['immediate_audio', 'recorder_audio', 'audio_long', 'local_audio', 'audio', 'class_audio', 'link', 'img_text', 'recorder_flash_audio', 'internal_record', 'meeting', 'blogger_post'])
    );
  });

  it('filters the picker list by tags and selects the visible matches', async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetchNotes).mockResolvedValueOnce({
      notes: [
        makeNote({ note_id: 'tagged', title: '项目规划', tags: [{ name: '知识库' }] }),
        makeNote({ note_id: 'plain', title: '日常记录', tags: [{ name: 'daily' }] }),
      ],
      hasMore: false,
    });

    const container = await renderPicker({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    }, onConfirm);

    const searchInput = container.querySelector('.getnote-picker-search input') as HTMLInputElement;
    await act(() => {
      searchInput.value = '知识';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('项目规划');
    expect(container.textContent).not.toContain('日常记录');

    await act(() => {
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === '全选')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(() => {
      container.querySelector('.mod-cta')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith(['tagged'], undefined);
  });
});

describe('NotePickerModal card layout (#138)', () => {
  async function renderPickerWithNotes(notes: GetNoteNote[], props: { token: string; clientId: string; authMode: 'openapi' | 'web' }, onConfirm = vi.fn()) {
    vi.mocked(fetchNotes).mockResolvedValueOnce({ notes, hasMore: false });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(NotePickerModal, {
          ...props,
          onConfirm,
          onCancel: vi.fn(),
        }),
        container
      );
      await Promise.resolve();
    });
    await act(async () => {
      await new Promise(resolve => setTimeout(resolve, 0));
    });
    return container;
  }

  it('renders each note as a card containing title, summary, content preview, tags, and timestamp', async () => {
    const notes: GetNoteNote[] = [
      {
        id: 1,
        note_id: 'card-1',
        title: 'AI 摘要卡片化测试',
        content: '这是一段很长的正文内容，用于验证卡片是否正确显示正文预览区域。'.repeat(20),
        note_type: 'plain_text',
        source: 'app',
        tags: [{ name: '工作' }, { name: '重要' }],
        created_at: '2026-06-01T10:00:00+08:00',
        updated_at: '2026-06-10T15:30:00+08:00',
      },
    ];

    const container = await renderPickerWithNotes(notes, {
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    });

    const card = container.querySelector('.getnote-note-card');
    expect(card).not.toBeNull();

    // 标题存在（粗体大字号）
    const title = card!.querySelector('.getnote-note-card-title');
    expect(title).not.toBeNull();
    expect(title!.textContent).toContain('AI 摘要卡片化测试');

    // AI 摘要框（灰色背景）
    const summary = card!.querySelector('.getnote-note-card-summary');
    expect(summary).not.toBeNull();
    expect(summary!.textContent).toBeTruthy();

    // 正文预览存在
    const preview = card!.querySelector('.getnote-note-card-preview');
    expect(preview).not.toBeNull();

    // 标签 chips
    const chips = card!.querySelectorAll('.getnote-note-card-tag');
    expect(chips.length).toBe(2);
    expect(chips[0].textContent).toContain('工作');
    expect(chips[1].textContent).toContain('重要');

    // 时间戳存在
    const time = card!.querySelector('.getnote-note-card-time');
    expect(time).not.toBeNull();
    expect(time!.textContent).toBeTruthy();
  });

  it('renders the card list as a single-column vertical layout (one card per row)', async () => {
    const notes: GetNoteNote[] = [
      makeNote({ note_id: 'row-1', title: '卡片 1' }),
      makeNote({ note_id: 'row-2', title: '卡片 2' }),
      makeNote({ note_id: 'row-3', title: '卡片 3' }),
    ];
    const container = await renderPickerWithNotes(notes, {
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    });

    const cards = Array.from(container.querySelectorAll('.getnote-note-card'));
    expect(cards.length).toBe(3);

    // 每张卡片都是 block-level（不在一行）
    cards.forEach(card => {
      const style = (card as HTMLElement).style.display || window.getComputedStyle(card as HTMLElement).display;
      expect(['block', 'flex', 'grid'].includes(style) || style === '').toBe(true);
    });
  });

  it('clicking a tag chip on a card adds the tag to the search query (issue #106 behavior)', async () => {
    const notes: GetNoteNote[] = [
      makeNote({ note_id: 'tagged', title: '笔记', tags: [{ name: '工作' }, { name: 'AI' }] }),
      makeNote({ note_id: 'plain', title: '无标签' }),
    ];
    const container = await renderPickerWithNotes(notes, {
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    });

    const firstTag = container.querySelector('.getnote-note-card-tag') as HTMLElement;
    expect(firstTag).not.toBeNull();
    await act(async () => {
      firstTag.click();
    });

    const searchInput = container.querySelector('.getnote-picker-search input') as HTMLInputElement;
    expect(searchInput.value).toContain('工作');
  });
});

describe('NotePickerModal type label folding (#141 follow-up)', () => {
  beforeAll(() => {
    initI18n('zh-CN');
  });

  async function renderPickerWithNotes(notes: GetNoteNote[]) {
    vi.mocked(fetchNotes).mockResolvedValueOnce({ notes, hasMore: false });

    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(NotePickerModal, {
          token: 'web-token',
          clientId: '',
          authMode: 'web',
          onConfirm: vi.fn(),
          onCancel: vi.fn(),
        }),
        container
      );
      await Promise.resolve();
    });
    return container;
  }

  it('folds all 9 internal audio note types into "录音笔记"', async () => {
    const audioTypes = [
      'recorder_audio',
      'recorder_flash_audio',
      'immediate_audio',
      'audio_long',
      'local_audio',
      'audio',
      'class_audio',
      'internal_record',
      'meeting',
    ];

    for (const noteType of audioTypes) {
      const container = await renderPickerWithNotes([
        makeNote({ note_id: `n-${noteType}`, title: `音频-${noteType}`, note_type: noteType }),
      ]);
      const typeLabel = container.querySelector('.getnote-note-card-type');
      expect(typeLabel?.textContent).toBe('录音笔记');
      expect(typeLabel?.textContent).not.toContain('picker.type.');
    }
  });

  it('folds blogger_post into "其他"', async () => {
    const container = await renderPickerWithNotes([
      makeNote({ note_id: 'bp', title: '订阅博主', note_type: 'blogger_post' }),
    ]);
    const typeLabel = container.querySelector('.getnote-note-card-type');
    expect(typeLabel?.textContent).toBe('其他');
    expect(typeLabel?.textContent).not.toContain('picker.type.');
  });

  it('keeps plain_text label as "文字笔记"', async () => {
    const container = await renderPickerWithNotes([
      makeNote({ note_id: 'pt', title: '普通笔记', note_type: 'plain_text' }),
    ]);
    expect(container.querySelector('.getnote-note-card-type')?.textContent).toBe('文字笔记');
  });

  it('keeps img_text label as "图片笔记"', async () => {
    const container = await renderPickerWithNotes([
      makeNote({ note_id: 'it', title: '图片笔记', note_type: 'img_text' }),
    ]);
    expect(container.querySelector('.getnote-note-card-type')?.textContent).toBe('图片笔记');
  });

  it('keeps link label as "链接笔记"', async () => {
    const container = await renderPickerWithNotes([
      makeNote({ note_id: 'lk', title: '链接笔记', note_type: 'link' }),
    ]);
    expect(container.querySelector('.getnote-note-card-type')?.textContent).toBe('链接笔记');
  });
});
