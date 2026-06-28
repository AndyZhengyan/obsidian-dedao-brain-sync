import { useState, useEffect, useCallback } from 'preact/hooks';
import type { AuthMode, GetNoteNote } from '../types';
import { fetchNotes } from '../api';
import { generateDisplayTitle } from '../note-parser';
import { t } from '../i18n';
import { formatNoteTypeLabel } from '../utils/note-type';
import { NoteTypeSelect } from './note-type-select';
import { TagSelect } from './tag-select';
import { applyTagFilter, mergeTagNames } from '../utils/tag-aggregator';

interface NotePickerModalProps {
  onConfirm: (selectedNoteIds: string[], enabledNoteTypes?: string[], syncTags?: string[]) => void;
  onCancel: () => void;
  token: string;
  clientId: string;
  authMode?: AuthMode;
  abortSignal?: AbortSignal;
  initialSyncTags?: string[];
  tagOptions?: string[];
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return t('picker.yesterday');
  } else {
    return `${diffDays}${t('picker.daysAgo')}`;
  }
}

function getTypeLabel(noteType: string): string {
  return formatNoteTypeLabel(noteType);
}

function matchesSearchQuery(note: GetNoteNote, searchQuery: string): boolean {
  const queryTokens = searchQuery.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (queryTokens.length === 0) return true;

  const haystacks = [
    generateDisplayTitle(note),
    ...note.tags.map(tag => tag.name),
  ];

  return queryTokens.every(token => haystacks.some(value => value.toLowerCase().includes(token)));
}

function compactCardText(value: string | undefined): string {
  return (value ?? '').replace(/\n+/g, ' ').trim();
}

function NoteRow({ note, checked, onChange, onTagClick }: { note: GetNoteNote; checked: boolean; onChange: (id: string, v: boolean) => void; onTagClick?: (tagName: string) => void }) {
  const title = generateDisplayTitle(note);
  const displayTitle = title || t('picker.noTitle');
  const previewText = compactCardText(note.content).slice(0, 150);
  const toggleSelection = () => onChange(note.note_id, !checked);
  return (
    <div
      className={`getnote-note-card${checked ? ' is-selected' : ''}`}
      role="checkbox"
      aria-checked={checked}
      tabIndex={0}
      onClick={toggleSelection}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key !== ' ' && e.key !== 'Enter') return;
        e.preventDefault();
        toggleSelection();
      }}
    >
      <input
        type="checkbox"
        className="getnote-note-card-checkbox"
        checked={checked}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => onChange(note.note_id, (e.target as HTMLInputElement).checked)}
      />
      <div className="getnote-note-card-body">
        <div className="getnote-note-card-header">
          <div className="getnote-note-card-title">{displayTitle}</div>
          <span className="getnote-note-card-type">{getTypeLabel(note.note_type)}</span>
        </div>
        {previewText && (
          <div className="getnote-note-card-preview">{previewText}</div>
        )}
        <div className="getnote-note-card-footer">
          {note.tags.length > 0 && (
            <div className="getnote-note-card-tags">
              {note.tags.map((tag, index) => (
                <button
                  key={`${tag.name}-${index}`}
                  type="button"
                  className="getnote-note-card-tag"
                  data-tag-name={tag.name}
                  onClick={(e) => {
                    e.stopPropagation();
                    onTagClick?.(tag.name);
                  }}
                >
                  #{tag.name}
                </button>
              ))}
            </div>
          )}
          <span className="getnote-note-card-time">{formatRelativeTime(note.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function NotePickerModal({ token, clientId, authMode, onConfirm, onCancel, abortSignal, initialSyncTags, tagOptions = [] }: NotePickerModalProps) {
  const [notes, setNotes] = useState<GetNoteNote[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState('0');
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [enabledNoteTypes, setEnabledNoteTypes] = useState<string[] | undefined>(undefined);
  const [syncTags, setSyncTags] = useState<string[]>(initialSyncTags ?? []);

  const loadFirstPage = useCallback(() => {
    setLoading(true);
    setError(null);
    setCursor('0');
    setHasMore(true);
    setNotes([]);
    void (async () => {
      try {
        const result = await fetchNotes({ token, clientId, authMode, sinceId: '0', signal: abortSignal });
        setNotes(result.notes);
        setHasMore(result.hasMore);
        if (result.notes.length > 0) setCursor(result.notes[result.notes.length - 1].note_id);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : t('picker.error'));
      } finally {
        setLoading(false);
      }
    })();
  }, [token, clientId, authMode, abortSignal]);

  useEffect(() => { loadFirstPage(); }, [loadFirstPage]);

  const loadNextPage = async () => {
    setLoadingMore(true);
    try {
      const result = await fetchNotes({ token, clientId, authMode, sinceId: cursor, signal: abortSignal });
      setNotes(prev => [...prev, ...result.notes]);
      setHasMore(result.hasMore);
      if (result.notes.length > 0) setCursor(result.notes[result.notes.length - 1].note_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('picker.error'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleCheck = (noteId: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) {
        next.add(noteId);
      } else {
        next.delete(noteId);
      }
      return next;
    });
  };

  const typeFilteredNotes = enabledNoteTypes === undefined
    ? notes
    : enabledNoteTypes.length > 0
    ? notes.filter(note => enabledNoteTypes.includes(note.note_type))
    : [];
  const tagFilteredNotes = applyTagFilter(typeFilteredNotes, syncTags);
  const availableTags = mergeTagNames(tagOptions);
  const filteredNotes = searchQuery
    ? tagFilteredNotes.filter(note => matchesSearchQuery(note, searchQuery))
    : tagFilteredNotes;
  const visibleSelectedIds = filteredNotes.filter(note => selected.has(note.note_id)).map(note => note.note_id);

  const handleSelectAll = () => setSelected(new Set(filteredNotes.map(n => n.note_id)));
  const handleSelectNone = () => setSelected(new Set());
  const handleConfirm = () => onConfirm(visibleSelectedIds, enabledNoteTypes, syncTags);
  const handleTagClick = (tagName: string) => {
    setSearchQuery((prev) => {
      const tag = tagName.trim();
      if (!tag) return prev;
      return prev.includes(tag) ? prev : (prev ? `${prev} ${tag}` : tag);
    });
  };

  return (
    <div className="getnote-picker">
      <div className="getnote-picker-header">
        <NoteTypeSelect value={enabledNoteTypes} onChange={setEnabledNoteTypes} />
        <TagSelect
          value={syncTags}
          options={availableTags}
          onChange={setSyncTags}
          placeholder={t('noteTags.searchPlaceholder')}
          allowCreate={false}
        />
        <div className="getnote-picker-actions">
          <button onClick={handleSelectAll}>{t('picker.selectAll')}</button>
          <button onClick={handleSelectNone}>{t('picker.selectNone')}</button>
        </div>
      </div>
      <div className="getnote-picker-body">
        {!loading && notes.length > 0 && (
          <div className="getnote-picker-search">
            <input
              type="text"
              className="getnote-input"
              placeholder={t('picker.search')}
              value={searchQuery}
              onInput={(e) => setSearchQuery((e.target as HTMLInputElement).value)}
            />
          </div>
        )}
        {loading && (
          <div className="getnote-picker-skeleton">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="getnote-skeleton-row">
                <div className="getnote-skeleton-checkbox" />
                <div className="getnote-skeleton-lines">
                  <div className="getnote-skeleton-line getnote-skeleton-line-primary" />
                  <div className="getnote-skeleton-line getnote-skeleton-line-secondary" />
                </div>
              </div>
            ))}
          </div>
        )}
        {error && !loading && <div className="getnote-picker-error">{error} <button onClick={loadFirstPage}>{t('picker.retry')}</button></div>}
        {!loading && !error && filteredNotes.map(note => (
          <NoteRow
            key={note.note_id}
            note={note}
            checked={selected.has(note.note_id)}
            onChange={handleCheck}
            onTagClick={handleTagClick}
          />
        ))}
        {!loading && !error && !loadingMore && hasMore && notes.length > 0 && (
          <div className="getnote-picker-loadmore">
            <button
              className="mod-secondary"
              onClick={() => {
                void loadNextPage();
              }}
            >
              {t('picker.loadMore', { count: notes.length })}
            </button>
          </div>
        )}
        {!loading && loadingMore && <div className="getnote-picker-loading">{t('picker.loadingMore')}</div>}
        {!loading && !error && filteredNotes.length === 0 && notes.length > 0 && (
          <div className="getnote-picker-empty">{t('picker.noMatch')}</div>
        )}
        {!loading && !error && notes.length === 0 && <div className="getnote-picker-empty">{t('picker.empty')}</div>}
      </div>
      <div className="getnote-picker-footer">
        <span className="getnote-picker-count">{t('picker.selected', { count: visibleSelectedIds.length })}</span>
        <div className="getnote-picker-btns">
          <button className="mod-cancel" onClick={onCancel}>{t('picker.cancel')}</button>
          <button className="mod-cta" disabled={visibleSelectedIds.length === 0} onClick={handleConfirm}>{t('picker.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
