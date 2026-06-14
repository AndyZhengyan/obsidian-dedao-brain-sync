import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { fetchNotes } from '../src/api';
import { generateDisplayTitle } from '../src/note-parser';
import { NotePickerModal } from '../src/ui/note-picker-modal';
import { applyTagFilter } from '../src/utils/tag-aggregator';
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

    const linkRowCheckbox = Array.from(container.querySelectorAll('.getnote-picker-row input[type="checkbox"]'))[0] as HTMLInputElement;
    await act(() => {
      linkRowCheckbox.checked = true;
      linkRowCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(() => {
      container.querySelector('.mod-cta')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith(['link'], ['immediate_audio', 'recorder_audio', 'audio_long', 'local_audio', 'audio', 'class_audio', 'link', 'img_text', 'recorder_flash_audio', 'internal_record', 'meeting', 'blogger_post'], []);
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

    expect(onConfirm).toHaveBeenCalledWith(['tagged'], undefined, []);
  });

  it('filters picker list by the tag whitelist dropdown', async () => {
    const onConfirm = vi.fn();
    vi.mocked(fetchNotes).mockResolvedValueOnce({
      notes: [
        makeNote({ note_id: 'work_note', title: '工作笔记', tags: [{ name: 'work' }, { name: 'daily' }] }),
        makeNote({ note_id: 'home_note', title: '生活笔记', tags: [{ name: 'home' }] }),
        makeNote({ note_id: 'no_tag_note', title: '无标签笔记', tags: [] }),
      ],
      hasMore: false,
    });

    const container = await renderPicker({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    }, onConfirm);

    // Open the tag dropdown (trigger shows "All tags" by default)
    const tagTrigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部标签');
    expect(tagTrigger).toBeTruthy();
    await act(() => {
      tagTrigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const workOption = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === 'work');
    expect(workOption).toBeTruthy();
    const workCheckbox = workOption!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(() => {
      workCheckbox.checked = true;
      workCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(container.textContent).toContain('工作笔记');
    expect(container.textContent).not.toContain('生活笔记');
    expect(container.textContent).not.toContain('无标签笔记');

    // submit and verify tag whitelist is forwarded
    await act(() => {
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === '全选')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(() => {
      container.querySelector('.mod-cta')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith(['work_note'], undefined, ['work']);
  });
});

/**
 * The picker modal's tag-whitelist filter must mirror `applyTagFilter` in
 * `src/utils/tag-aggregator.ts`. The two implementations previously drifted
 * (different case handling, picker never trimmed note tags), so we test the
 * behaviour end-to-end through the modal UI.
 */
describe('NotePickerModal — tag filter matches applyTagFilter (engine parity)', () => {
  async function renderPickerWithTags(notes: GetNoteNote[], props: { token: string; clientId: string; authMode: 'openapi' | 'web' }, onConfirm = vi.fn()) {
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
    return container;
  }

  function getAllNoteIdsFromUI(container: HTMLElement): string[] {
    return Array.from(container.querySelectorAll('.getnote-picker-row input[type="checkbox"]'))
      .map(input => {
        const row = input.closest('.getnote-picker-row') as HTMLElement;
        return row.querySelector('.getnote-picker-title')?.textContent ?? '';
      });
  }

  async function selectTagInDropdown(container: HTMLElement, tagLabel: string) {
    const trigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部标签');
    expect(trigger).toBeTruthy();
    await act(() => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const option = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === tagLabel);
    expect(option).toBeTruthy();
    const checkbox = option!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(() => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }

  it('applies the empty-whitelist contract: no filter, all notes shown', async () => {
    const notes = [
      makeNote({ note_id: 'a', title: 'A', tags: [{ name: 'work' }] }),
      makeNote({ note_id: 'b', title: 'B', tags: [{ name: 'home' }] }),
      makeNote({ note_id: 'c', title: 'C', tags: [] }),
    ];
    const container = await renderPickerWithTags(notes, { token: 'web', clientId: '', authMode: 'web' });
    // No tag selected — default "全部标签" means whitelist is empty.
    expect(getAllNoteIdsFromUI(container)).toHaveLength(3);
    // Sanity: applyTagFilter agrees.
    expect(applyTagFilter(notes, []).map(n => n.note_id)).toHaveLength(3);
  });

  it('matches the engine case-insensitively (whitelist "WORK" matches note tag "work")', async () => {
    const notes = [
      makeNote({ note_id: 'work_note', title: '工作笔记', tags: [{ name: 'work' }] }),
      makeNote({ note_id: 'home_note', title: '生活笔记', tags: [{ name: 'home' }] }),
    ];
    const container = await renderPickerWithTags(notes, { token: 'web', clientId: '', authMode: 'web' });
    await selectTagInDropdown(container, 'work');

    const visibleTitles = getAllNoteIdsFromUI(container);
    expect(visibleTitles).toContain('工作笔记');
    expect(visibleTitles).not.toContain('生活笔记');

    // Engine parity
    const engineResult = applyTagFilter(notes, ['WORK']);
    expect(engineResult.map(n => n.note_id)).toEqual(['work_note']);
  });

  it('trims whitespace inside note tag names (engine parity)', async () => {
    // Note tags arrive with leading/trailing whitespace; the engine trims
    // before matching, so the picker must do the same to stay consistent.
    const notes = [
      makeNote({ note_id: 'padded', title: 'Padded', tags: [{ name: '  work  ' }] }),
      makeNote({ note_id: 'clean', title: 'Clean', tags: [{ name: 'work' }] }),
      makeNote({ note_id: 'home', title: 'Home', tags: [{ name: 'home' }] }),
    ];
    const container = await renderPickerWithTags(notes, { token: 'web', clientId: '', authMode: 'web' });
    await selectTagInDropdown(container, 'work');

    const visibleTitles = getAllNoteIdsFromUI(container);
    // Both padded and clean should be visible — the engine trims before comparing.
    expect(visibleTitles).toContain('Padded');
    expect(visibleTitles).toContain('Clean');
    expect(visibleTitles).not.toContain('Home');

    // Engine parity
    const engineResult = applyTagFilter(notes, ['work']);
    expect(engineResult.map(n => n.note_id).sort()).toEqual(['clean', 'padded']);
  });

  it('excludes notes with no tags when a non-empty whitelist is set', async () => {
    const notes = [
      makeNote({ note_id: 'tagged', title: 'Tagged', tags: [{ name: 'work' }] }),
      makeNote({ note_id: 'untagged', title: 'Untagged', tags: [] }),
    ];
    const container = await renderPickerWithTags(notes, { token: 'web', clientId: '', authMode: 'web' });
    await selectTagInDropdown(container, 'work');

    const visibleTitles = getAllNoteIdsFromUI(container);
    expect(visibleTitles).toContain('Tagged');
    expect(visibleTitles).not.toContain('Untagged');

    // Engine parity
    expect(applyTagFilter(notes, ['work']).map(n => n.note_id)).toEqual(['tagged']);
  });

  it('submit scope mirrors the picker filter — only visible selected ids are forwarded', async () => {
    const onConfirm = vi.fn();
    const notes = [
      makeNote({ note_id: 'picked', title: 'Picked', tags: [{ name: 'work' }] }),
      makeNote({ note_id: 'hidden', title: 'Hidden', tags: [{ name: 'home' }] }),
    ];
    const container = await renderPickerWithTags(notes, { token: 'web', clientId: '', authMode: 'web' }, onConfirm);
    await selectTagInDropdown(container, 'work');

    // Click "全选" (select all visible) — the hidden note must not be included.
    await act(() => {
      Array.from(container.querySelectorAll('button'))
        .find(button => button.textContent === '全选')!
        .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(() => {
      container.querySelector('.mod-cta')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(onConfirm).toHaveBeenCalledWith(['picked'], undefined, ['work']);
  });
});
