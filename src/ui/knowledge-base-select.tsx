import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import {
  KnowledgeBaseAggregator,
  subscribedTopicsFetcher,
  type KnowledgeBaseEntry,
} from '../utils/knowledge-base-aggregator';
import { fetchSubscribedTopics } from '../api-clients/openapi-client';

interface KnowledgeBaseSelectProps {
  /** Selected knowledge-base topic ids (empty = cross-KB sync disabled). */
  value: string[];
  onChange: (value: string[]) => void;
  /** Whether the user has valid credentials — used to gate remote fetches. */
  hasCredentials?: boolean;
  /** Persisted cache snapshot to seed the aggregator. */
  initialCache?: { entries: KnowledgeBaseEntry[]; cacheUpdatedAt?: number };
  /** Notify the parent whenever the underlying cache is refreshed. */
  onCacheUpdate?: (snapshot: { entries: KnowledgeBaseEntry[]; cacheUpdatedAt: number }) => void;
}

interface AggregateState {
  loading: boolean;
  error: string | null;
  entries: KnowledgeBaseEntry[];
}

const EMPTY_STATE: AggregateState = { loading: false, error: null, entries: [] };

function summarize(value: string[], entries: KnowledgeBaseEntry[]): string {
  if (value.length === 0) return t('settings.scheduled.syncKnowledgeBases.empty');
  if (entries.length > 0 && value.length === entries.length) return t('knowledgeBases.all');
  const named = value
    .map(id => entries.find(entry => entry.topicId === id)?.name)
    .filter((name): name is string => Boolean(name));
  if (named.length === 0) return t('knowledgeBases.selected', { count: value.length });
  if (named.length <= 2) return named.join('、');
  return `${named[0]}、${named[1]} +${named.length - 2}`;
}

export function KnowledgeBaseSelect({
  value,
  onChange,
  hasCredentials,
  initialCache,
  onCacheUpdate,
}: KnowledgeBaseSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [state, setState] = useState<AggregateState>(() => ({
    ...EMPTY_STATE,
    entries: initialCache?.entries ?? [],
  }));
  const aggregatorRef = useRef<KnowledgeBaseAggregator | null>(null);
  const initialCacheRef = useRef(initialCache);

  useEffect(() => {
    if (!aggregatorRef.current) {
      aggregatorRef.current = new KnowledgeBaseAggregator(
        subscribedTopicsFetcher(fetchSubscribedTopics),
        initialCacheRef.current ? {
          cache: initialCacheRef.current.entries,
          cacheUpdatedAt: initialCacheRef.current.cacheUpdatedAt,
        } : undefined
      );
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    if (!hasCredentials) {
      setState(prev => ({ ...prev, error: null, loading: false }));
      return;
    }
    const aggregator = aggregatorRef.current;
    if (!aggregator) return;

    let cancelled = false;
    const cached = aggregator.exportCache();
    if (cached.entries.length > 0 && (Date.now() - (cached.cacheUpdatedAt ?? 0)) < 5 * 60 * 1000) {
      setState({ loading: false, error: null, entries: cached.entries });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    aggregator
      .refresh({ token: '', clientId: '' })
      .then(snapshot => {
        if (cancelled) return;
        setState({ loading: false, error: null, entries: snapshot.entries });
        onCacheUpdate?.({ entries: snapshot.entries, cacheUpdatedAt: snapshot.cacheUpdatedAt ?? Date.now() });
      })
      .catch(err => {
        if (cancelled) return;
        setState({ loading: false, error: err instanceof Error ? err.message : String(err), entries: aggregator.list() });
      });

    return () => {
      cancelled = true;
    };
  }, [open, hasCredentials, onCacheUpdate]);

  const filtered = useMemo(() => {
    const lower = query.trim().toLowerCase();
    if (!lower) return state.entries;
    return state.entries.filter(entry =>
      entry.topicId.toLowerCase().includes(lower) || entry.name.toLowerCase().includes(lower)
    );
  }, [state.entries, query]);

  const handleToggle = (entry: KnowledgeBaseEntry, checked: boolean) => {
    const exists = value.includes(entry.topicId);
    if (checked && !exists) onChange([...value, entry.topicId]);
    else if (!checked && exists) onChange(value.filter(id => id !== entry.topicId));
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) onChange(state.entries.map(entry => entry.topicId));
    else onChange([]);
  };

  const allSelected = state.entries.length > 0 && value.length === state.entries.length;
  const triggerLabel = state.loading
    ? t('knowledgeBases.loading')
    : state.error
      ? t('knowledgeBases.error')
      : summarize(value, state.entries);

  return (
    <div className="getnote-knowledge-base-select">
      <button
        type="button"
        className="getnote-knowledge-base-select-trigger"
        onClick={() => setOpen(prev => !prev)}
      >
        <span>{triggerLabel}</span>
        <span aria-hidden="true" className={`getnote-knowledge-base-select-caret${open ? ' is-open' : ''}`} />
      </button>
      {open && (
        <div className="getnote-knowledge-base-select-menu">
          <input
            type="search"
            className="getnote-knowledge-base-select-search"
            placeholder={t('knowledgeBases.searchPlaceholder')}
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
          />
          {state.entries.length > 0 && (
            <label className="getnote-knowledge-base-select-option">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(event) => handleSelectAll((event.target as HTMLInputElement).checked)}
              />
              <span>{t('knowledgeBases.all')}</span>
            </label>
          )}
          {state.loading && state.entries.length === 0 && (
            <div className="getnote-knowledge-base-select-status">{t('knowledgeBases.loading')}</div>
          )}
          {state.error && state.entries.length === 0 && (
            <div className="getnote-knowledge-base-select-status getnote-knowledge-base-select-error">{state.error}</div>
          )}
          {!state.loading && state.entries.length === 0 && !state.error && (
            <div className="getnote-knowledge-base-select-status">{t('knowledgeBases.none')}</div>
          )}
          {filtered.map(entry => (
            <label className="getnote-knowledge-base-select-option" key={entry.topicId}>
              <input
                type="checkbox"
                checked={value.includes(entry.topicId)}
                onChange={(event) => handleToggle(entry, (event.target as HTMLInputElement).checked)}
              />
              <span>{entry.name || entry.topicId}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}