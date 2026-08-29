import { describe, it, expect } from 'vitest';
import { renderNote, renderNoteWithTemplate, getNoteTitle } from './note-parser';
import { parseSourceBody } from './source-body';
import { getCategoryDir } from './types';
import type { GetNoteNote } from './types';

function makeNote(overrides: Partial<GetNoteNote> = {}): GetNoteNote {
  return {
    id: 1,
    note_id: 'note_001',
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

describe('renderNote', () => {
  it('includes note_id and title in frontmatter', () => {
    const md = renderNote(makeNote());
    expect(md).toContain('uid: "note_001"');
    expect(md).toContain('title: "测试笔记"');
    expect(md).toContain('正文内容');
  });

  it('falls back to content for empty title', () => {
    const md = renderNote(makeNote({ title: '', content: '1234567890内容' }));
    expect(md).toContain('title: "1234567890内容"');
  });

  it('handles notes with tags', () => {
    const md = renderNote(makeNote({ tags: [{ name: 'work' }, { name: 'obsidian' }] }));
    expect(md).toContain('tags: ["work", "obsidian"]');
  });

  it('handles empty tags', () => {
    const md = renderNote(makeNote());
    expect(md).toContain('tags: []');
  });
});

describe('getNoteTitle', () => {
  it('returns title when present', () => {
    expect(getNoteTitle(makeNote())).toBe('测试笔记');
  });

  it('falls back to content preview when title is empty', () => {
    const note = makeNote({ title: '', content: 'abcdefghij额外' });
    expect(getNoteTitle(note)).toBe('abcdefghij...');
  });
});

describe('getCategoryDir', () => {
  it('maps known note types', () => {
    expect(getCategoryDir('plain_text')).toBe('纯文本');
    expect(getCategoryDir('link')).toBe('链接笔记');
    expect(getCategoryDir('immediate_audio')).toBe('录音笔记');
  });

  it('returns 其他 for unknown types', () => {
    expect(getCategoryDir('unknown_type')).toBe('其他');
  });
});

describe('source-body rendering', () => {
  it('uses one escaped frontmatter title for a multiline fallback title', () => {
    const result = renderNote(makeNote({ title: '', content: 'first line\nsecond line' }));

    expect(result).toContain('title: "first line second line"');
    expect(result).not.toContain('title: "first line\nsecond line"');
  });

  it.each([
    '- parent\n  1. child\n     - nested',
    '| a | b |\n| --- | --- |\n| 1 | 2 |',
    '> quote\n>\n> - [x] task',
    '```ts\nconst value = `code`;\n```\n\n$E=mc^2$',
    '中文、emoji 🚀、**bold**、==highlight==、~~gone~~',
    '[link](https://example.com/a%20b)\n\n![image](https://example.com/image.png)',
    '\n\nleading\n\ntrailing\n\n',
  ])('preserves a representative Markdown source fixture: %s', (content) => {
    const result = renderNote(makeNote({ content }));

    expect(parseSourceBody(result)).toEqual({ kind: 'valid', body: content.replace(/\r\n?/g, '\n') });
  });

  it('writes one source-body boundary and portable baseline fields', () => {
    const result = renderNote(makeNote({ content: '\r\n# source\r\n\r\nbody\r\n' }));

    expect(result).toContain('dedao_sync_schema: 1');
    expect(result).toMatch(/dedao_source_hash: "sha256:[a-f0-9]{64}"/);
    expect(parseSourceBody(result)).toEqual({ kind: 'valid', body: '\n# source\n\nbody\n' });
  });

  it('keeps audio and transcript blocks outside the source-body boundary', () => {
    const result = renderNote(makeNote({
      content: 'remote text',
      audio: 'transcript text',
      assetPaths: ['得到大脑/录音笔记/asset/test_audio.mp3'],
    }));

    expect(parseSourceBody(result)).toEqual({ kind: 'valid', body: 'remote text' });
    expect(result).toContain('> 🔊 录音');
    expect(result).toContain('### 原始录音转写');
  });

  it('uses exactly one content placeholder as the source-body insertion point', () => {
    const result = renderNoteWithTemplate(makeNote({ content: 'remote text' }), 'before\n\n{{content}}\n\nafter');

    expect(parseSourceBody(result)).toEqual({ kind: 'valid', body: 'remote text' });
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('rejects duplicate or frontmatter content placeholders', () => {
    expect(() => renderNoteWithTemplate(makeNote(), '{{content}}\n{{content}}')).toThrow(/content placeholder/i);
    expect(() => renderNoteWithTemplate(makeNote(), '---\nsummary: "{{content}}"\n---\nbody')).toThrow(/frontmatter/i);
  });
});
