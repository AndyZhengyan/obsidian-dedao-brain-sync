import type { GetNoteNote, Tag } from '../types';

export interface TagCache {
  tags: string[];
  lastUpdated: number;
}

export const EMPTY_TAG_CACHE: TagCache = { tags: [], lastUpdated: 0 };

/**
 * Aggregate tag names from a list of notes. Returns unique, sorted tag names.
 * Comparison is case-insensitive; first-seen casing is preserved in the output.
 * Empty tag names are skipped.
 */
export function aggregateTagsFromNotes(notes: GetNoteNote[]): string[] {
  const seen = new Map<string, string>();
  for (const note of notes) {
    if (!Array.isArray(note.tags)) continue;
    for (const tag of note.tags) {
      const name = tag?.name?.trim();
      if (!name) continue;
      const key = name.toLowerCase();
      if (!seen.has(key)) seen.set(key, name);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.toLowerCase().localeCompare(b.toLowerCase())
  );
}

/**
 * Merge an existing tag cache with newly observed tag names.
 * Existing tags are preserved; new tags are appended (case-insensitive dedup).
 * The returned `lastUpdated` is `Date.now()`.
 */
export function mergeTagCache(existing: TagCache | undefined, incoming: string[]): TagCache {
  const seen = new Map<string, string>();
  const addName = (name: string) => {
    const trimmed = name?.trim();
    if (!trimmed) return;
    const key = trimmed.toLowerCase();
    if (!seen.has(key)) seen.set(key, trimmed);
  };
  for (const name of existing?.tags ?? []) addName(name);
  for (const name of incoming) addName(name);
  return {
    tags: Array.from(seen.values()).sort((a, b) =>
      a.toLowerCase().localeCompare(b.toLowerCase())
    ),
    lastUpdated: Date.now(),
  };
}

/**
 * Apply a tag whitelist filter to notes.
 * - Empty whitelist returns the original notes unchanged (no filter).
 * - Non-empty whitelist keeps notes whose `note.tags` shares at least one
 *   tag name with the whitelist (case-insensitive comparison).
 */
export function applyTagFilter(notes: GetNoteNote[], whitelist: string[] | undefined): GetNoteNote[] {
  if (!whitelist || whitelist.length === 0) return notes;
  const normalizedWhitelist = new Set(
    whitelist.filter(Boolean).map(name => name.toLowerCase())
  );
  if (normalizedWhitelist.size === 0) return notes;
  return notes.filter(note => {
    if (!Array.isArray(note.tags) || note.tags.length === 0) return false;
    return note.tags.some(tag => {
      const name = tag?.name?.trim();
      return name ? normalizedWhitelist.has(name.toLowerCase()) : false;
    });
  });
}

/**
 * Alias of `applyTagFilter` for use as a private method on SyncEngine.
 */
export const filterNotesByTags = applyTagFilter;

/**
 * Extract just the tag names from a list of notes (alias of
 * `aggregateTagsFromNotes`).
 */
export function extractTagNames(notes: GetNoteNote[]): string[] {
  return aggregateTagsFromNotes(notes);
}

/**
 * Convenience helper for the sync engine: append a freshly synced batch of
 * notes' tags into the cache. Returns the new cache (or the original if no
 * tags were observed).
 */
export function updateCacheFromNotes(cache: TagCache | undefined, notes: GetNoteNote[]): TagCache {
  const incoming = aggregateTagsFromNotes(notes);
  if (incoming.length === 0) return cache ?? EMPTY_TAG_CACHE;
  return mergeTagCache(cache, incoming);
}

/**
 * Quick check whether a note has at least one tag in the whitelist.
 */
export function noteMatchesTagWhitelist(note: GetNoteNote, whitelist: string[] | undefined): boolean {
  if (!whitelist || whitelist.length === 0) return true;
  if (!Array.isArray(note.tags) || note.tags.length === 0) return false;
  const normalizedWhitelist = new Set(whitelist.map(name => name.toLowerCase()));
  return note.tags.some(tag => {
    const name = tag?.name?.trim();
    return name ? normalizedWhitelist.has(name.toLowerCase()) : false;
  });
}

// Avoid unused-import warning for the Tag interface; re-exported so callers can
// reach it via this module if needed.
export type { Tag };