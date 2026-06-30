import { describe, it, expect } from 'vitest';
import {
  aggregateTagsFromNotes,
  mergeTagCache,
  applyTagFilter,
  filterNotesByTags,
  noteMatchesTagWhitelist,
  type TagCache,
} from '../src/utils/tag-aggregator';
import type { GetNoteNote } from '../src/types';

function makeNote(overrides: Partial<GetNoteNote> = {}): GetNoteNote {
  return {
    id: '1',
    note_id: 'note_1',
    title: 'note',
    content: '',
    note_type: 'plain_text',
    source: 'app',
    tags: [],
    created_at: '2026-04-27T22:26:17+08:00',
    updated_at: '2026-04-28T10:00:00+08:00',
    ...overrides,
  };
}

describe('tag-aggregator — aggregateTagsFromNotes', () => {
  it('returns unique tag names sorted alphabetically (case-insensitive)', () => {
    const notes = [
      makeNote({ tags: [{ name: 'work' }, { name: 'Daily' }] }),
      makeNote({ tags: [{ name: 'work' }, { name: 'project' }] }),
      makeNote({ tags: [] }),
    ];
    const result = aggregateTagsFromNotes(notes);
    expect(result).toEqual(['Daily', 'project', 'work']);
  });

  it('skips empty tag names', () => {
    const notes = [
      makeNote({ tags: [{ name: '' }, { name: 'real' }] }),
    ];
    expect(aggregateTagsFromNotes(notes)).toEqual(['real']);
  });

  it('returns empty array when no tags', () => {
    expect(aggregateTagsFromNotes([])).toEqual([]);
    expect(aggregateTagsFromNotes([makeNote({ tags: [] })])).toEqual([]);
  });

  it('dedupes across notes that share tag names with different casing', () => {
    const notes = [
      makeNote({ tags: [{ name: 'Daily' }] }),
      makeNote({ tags: [{ name: 'daily' }] }),
      makeNote({ tags: [{ name: 'DAILY' }] }),
    ];
    // First-seen casing wins, lower-case duplicates filtered out
    const result = aggregateTagsFromNotes(notes);
    expect(result).toHaveLength(1);
    expect(result[0].toLowerCase()).toBe('daily');
  });
});

describe('tag-aggregator — mergeTagCache', () => {
  it('adds new tags incrementally without removing existing ones', () => {
    const existing: TagCache = {
      tags: ['alpha', 'beta'],
      lastUpdated: 100,
    };
    const next = mergeTagCache(existing, ['beta', 'gamma']);
    expect(next.tags.sort()).toEqual(['alpha', 'beta', 'gamma']);
    expect(next.lastUpdated).toBeGreaterThanOrEqual(existing.lastUpdated);
  });

  it('preserves existing tags when incoming list is empty', () => {
    const existing: TagCache = { tags: ['x'], lastUpdated: 100 };
    const next = mergeTagCache(existing, []);
    expect(next.tags).toEqual(['x']);
  });

  it('deduplicates case-insensitively while keeping first-seen casing', () => {
    const existing: TagCache = { tags: ['Work'], lastUpdated: 100 };
    const next = mergeTagCache(existing, ['work', 'WORK', 'home']);
    expect(next.tags.sort()).toEqual(['Work', 'home']);
  });
});

describe('tag-aggregator — applyTagFilter', () => {
  const notes = [
    makeNote({ note_id: 'a', tags: [{ name: 'work' }, { name: 'project' }] }),
    makeNote({ note_id: 'b', tags: [{ name: 'daily' }] }),
    makeNote({ note_id: 'c', tags: [] }),
    makeNote({ note_id: 'd', tags: [{ name: 'project' }] }),
  ];

  it('returns all notes when whitelist is empty (no filter)', () => {
    expect(applyTagFilter(notes, [])).toHaveLength(4);
  });

  it('returns notes whose tags intersect with whitelist', () => {
    const result = applyTagFilter(notes, ['project']);
    expect(result.map(n => n.note_id).sort()).toEqual(['a', 'd']);
  });

  it('supports multiple whitelist tags (union semantics)', () => {
    const result = applyTagFilter(notes, ['work', 'daily']);
    expect(result.map(n => n.note_id).sort()).toEqual(['a', 'b']);
  });

  it('excludes notes with no tags when whitelist is non-empty', () => {
    const result = applyTagFilter(notes, ['daily']);
    expect(result.map(n => n.note_id)).toEqual(['b']);
  });

  it('matches tags case-insensitively', () => {
    const result = applyTagFilter(notes, ['WORK']);
    expect(result.map(n => n.note_id)).toEqual(['a']);
  });

  it('trims whitelist values before matching tags', () => {
    const result = applyTagFilter(notes, ['  work  ', '   ']);
    expect(result.map(n => n.note_id)).toEqual(['a']);
  });

  it('returns empty when whitelist tags do not exist on any note', () => {
    expect(applyTagFilter(notes, ['nonexistent'])).toEqual([]);
  });
});

describe('tag-aggregator — filterNotesByTags (re-exported alias)', () => {
  it('behaves identically to applyTagFilter', () => {
    const notes = [
      makeNote({ note_id: 'a', tags: [{ name: 'x' }] }),
      makeNote({ note_id: 'b', tags: [] }),
    ];
    expect(filterNotesByTags(notes, ['x']).map(n => n.note_id)).toEqual(['a']);
    expect(filterNotesByTags(notes, [])).toHaveLength(2);
  });
});

describe('tag-aggregator — noteMatchesTagWhitelist', () => {
  it('uses the same trimming and case-insensitive rules as applyTagFilter', () => {
    const note = makeNote({ note_id: 'a', tags: [{ name: 'Work' }] });
    expect(noteMatchesTagWhitelist(note, ['  work  ', '   '])).toBe(true);
  });
});
