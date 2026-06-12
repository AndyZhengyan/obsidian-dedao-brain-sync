import { useState, useEffect, useCallback } from 'preact/hooks';
import type { AuthMode, SubscribedTopic } from '../types';
import type { ContentPreview, TopicContentPreviewCursor } from '../api';
import { fetchSubscribedTopics, fetchTopicContentPreviewPage } from '../api';
import { t } from '../i18n';

interface TopicData {
  topic: SubscribedTopic;
  contents: ContentPreview[];
  loading: boolean;
  loadingMore: boolean;
  nextCursor?: TopicContentPreviewCursor;
  error?: string;
}

export interface TopicPickerSelection {
  selectedNoteIds?: string[];
  syncAll?: boolean;
  topicIds?: string[];
  createdTopicIds?: string[];
  bloggerIds?: string[];
  knowledgeBaseName?: string;
  knowledgeBaseNames?: Record<string, string>;
}

interface TopicPickerModalProps {
  onConfirm: (selection: TopicPickerSelection) => void;
  onCancel: () => void;
  token: string;
  clientId: string;
  authMode?: AuthMode;
  abortSignal?: AbortSignal;
}

function formatRelativeTime(iso: string): string {
  if (!iso) return '';
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

function ContentRow({ item, checked, onChange }: { item: ContentPreview; checked: boolean; onChange: (noteId: string, v: boolean) => void }) {
  return (
    <div className="getnote-picker-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(item.note_id, (e.target as HTMLInputElement).checked)}
      />
      <div className="getnote-picker-row-info">
        <div className="getnote-picker-title">{item.title || t('picker.noTitle')}</div>
        <div className="getnote-picker-meta">
          {item.blogger_name && <span className="getnote-picker-type">{item.blogger_name}</span>}
          <span className="getnote-picker-time">{formatRelativeTime(item.updated_at)}</span>
        </div>
      </div>
    </div>
  );
}

export function TopicPickerModal({ token, clientId, authMode, onConfirm, onCancel, abortSignal }: TopicPickerModalProps) {
  const [topics, setTopics] = useState<SubscribedTopic[]>([]);
  const [topicData, setTopicData] = useState<Record<string, TopicData>>({});
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [topicsError, setTopicsError] = useState<string | null>(null);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());
  const [selectedItems, setSelectedItems] = useState<Map<string, ContentPreview>>(new Map());
  const [searchQuery, setSearchQuery] = useState('');
  const [bloggerFilter, setBloggerFilter] = useState('');
  const [selectAllActive, setSelectAllActive] = useState(false);
  const [syncAllActive, setSyncAllActive] = useState(false);
  const [topicSearchQuery, setTopicSearchQuery] = useState('');
  const matchesActiveFilters = (item: ContentPreview) =>
    (!bloggerFilter || item.blogger_name === bloggerFilter) &&
    (!searchQuery || item.title.toLowerCase().includes(searchQuery.toLowerCase()));

  const loadTopics = useCallback(() => {
    setTopicsLoading(true);
    setTopicsError(null);
    void (async () => {
      try {
        const result = await fetchSubscribedTopics({ token, clientId, authMode, signal: abortSignal });
        setTopics(result);
        const init: Record<string, TopicData> = {};
        for (const topic of result) {
          init[topic.topic_id] = { topic, contents: [], loading: false, loadingMore: false };
        }
        setTopicData(init);
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setTopicsError(err instanceof Error ? err.message : t('topicPicker.error'));
      } finally {
        setTopicsLoading(false);
      }
    })();
  }, [token, clientId, authMode, abortSignal]);

  useEffect(() => { loadTopics(); }, [loadTopics]);

  const loadTopicPage = async (topic: SubscribedTopic, cursor?: TopicContentPreviewCursor) => {
    const data = topicData[topic.topic_id];
    if (!data) return;
    const isLoadMore = Boolean(cursor);
    setTopicData(prev => ({
      ...prev,
      [topic.topic_id]: {
        ...prev[topic.topic_id],
        loading: !isLoadMore,
        loadingMore: isLoadMore,
        error: undefined,
      },
    }));
    try {
      const page = await fetchTopicContentPreviewPage(
        topic.topic_id,
        topic.name,
        token,
        clientId,
        authMode,
        abortSignal,
        cursor,
        topic.source
      );
      if (selectAllActive) setItemsSelected(page.items.filter(matchesActiveFilters), true);
      setTopicData(prev => ({
        ...prev,
        [topic.topic_id]: {
          ...prev[topic.topic_id],
          contents: isLoadMore
            ? [...prev[topic.topic_id].contents, ...page.items]
            : page.items,
          loading: false,
          loadingMore: false,
          nextCursor: page.nextCursor,
        },
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setTopicData(prev => ({
        ...prev,
        [topic.topic_id]: {
          ...prev[topic.topic_id],
          loading: false,
          loadingMore: false,
          error: err instanceof Error ? err.message : String(err),
        },
      }));
    }
  };

  const openTopic = async (topic: SubscribedTopic) => {
    setSearchQuery('');
    setBloggerFilter('');
    setSelectAllActive(false);
    setSyncAllActive(false);
    setSelectedNoteIds(new Set());
    setSelectedItems(new Map());
    setActiveTopicId(topic.topic_id);
    const data = topicData[topic.topic_id];
    if (!data || data.contents.length > 0) return;
    await loadTopicPage(topic);
  };

  const handleCheck = (noteId: string, checked: boolean) => {
    if (!checked) setSelectAllActive(false);
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(noteId);
      else next.delete(noteId);
      return next;
    });
    setSelectedItems(prev => {
      const next = new Map(prev);
      if (!checked) {
        next.delete(noteId);
        return next;
      }
      const item = Object.values(topicData)
        .flatMap(data => data.contents)
        .find(content => content.note_id === noteId);
      if (item) next.set(noteId, item);
      return next;
    });
  };

  const setItemsSelected = (items: ContentPreview[], checked: boolean) => {
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      for (const item of items) {
        if (checked) next.add(item.note_id);
        else next.delete(item.note_id);
      }
      return next;
    });
    setSelectedItems(prev => {
      const next = new Map(prev);
      for (const item of items) {
        if (checked) next.set(item.note_id, item);
        else next.delete(item.note_id);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    if (syncAllActive && activeTopic) {
      onConfirm({
        syncAll: true,
        ...(activeTopic.topic.source === 'created'
          ? { createdTopicIds: [activeTopic.topic.topic_id] }
          : { topicIds: [activeTopic.topic.topic_id] }),
        knowledgeBaseName: activeTopic.topic.name || activeTopic.topic.topic_id,
      });
      return;
    }
    const selected = Array.from(selectedItems.values());
    const topicIds = Array.from(new Set(selected.map(item => item.topic_id).filter((id): id is string => Boolean(id))));
    if (topicIds.length === 0 && activeTopicId) topicIds.push(activeTopicId);
    const createdTopicIds = topicIds.filter(id => topicData[id]?.topic.source === 'created');
    const subscribedTopicIds = topicIds.filter(id => topicData[id]?.topic.source !== 'created');
    const bloggerIds = Array.from(new Set(selected.map(item => item.blogger_id).filter((id): id is string => Boolean(id))));
    const knowledgeBaseNames = Object.fromEntries(selected.map(item => {
      const topicId = item.topic_id ?? activeTopicId;
      const topicName = topicId ? topicData[topicId]?.topic.name : undefined;
      return [item.note_id, topicName ?? topicId ?? t('picker.noTitle')];
    }));
    onConfirm({
      selectedNoteIds: Array.from(selectedNoteIds),
      ...(subscribedTopicIds.length > 0 ? { topicIds: subscribedTopicIds } : {}),
      ...(createdTopicIds.length > 0 ? { createdTopicIds } : {}),
      ...(bloggerIds.length > 0 ? { bloggerIds } : {}),
      ...(Object.keys(knowledgeBaseNames).length > 0 ? { knowledgeBaseNames } : {}),
    });
  };

  const activeTopic = activeTopicId ? topicData[activeTopicId] : null;
  const totalItems = activeTopic?.contents.length ?? 0;
  const filteredTopics = topicSearchQuery
    ? topics.filter(topic => topic.name.toLowerCase().includes(topicSearchQuery.toLowerCase()))
    : topics;
  const createdTopics = filteredTopics.filter(topic => topic.source === 'created');
  const subscribedTopics = filteredTopics.filter(topic => topic.source !== 'created');
  const bloggers = activeTopic
    ? Array.from(new Set(activeTopic.contents.map(item => item.blogger_name).filter((name): name is string => Boolean(name))))
    : [];
  const visibleItems = activeTopic
    ? activeTopic.contents.filter(matchesActiveFilters)
    : [];

  return (
    <div className="getnote-picker">
      <div className="getnote-picker-header">
        {activeTopic ? (
          <>
            <button className="getnote-topic-back" data-topic-back onClick={() => setActiveTopicId(null)}>
              <span aria-hidden="true">←</span>
              <span>{t('topicPicker.back')}</span>
            </button>
            <span className="getnote-picker-header-title">{activeTopic.topic.name || activeTopic.topic.topic_id}</span>
            {!syncAllActive && <div className="getnote-picker-actions">
              <button
                data-topic-select-all
                onClick={() => {
                  setSelectAllActive(true);
                  setItemsSelected(visibleItems, true);
                }}
              >
                {t('picker.selectAll')}
              </button>
              <button
                data-topic-select-none
                onClick={() => {
                  setSelectAllActive(false);
                  setItemsSelected(Array.from(selectedItems.values()), false);
                }}
              >
                {t('picker.selectNone')}
              </button>
            </div>}
          </>
        ) : (
          <span className="getnote-picker-header-title">{t('topicPicker.title')}</span>
        )}
      </div>
      {activeTopic && !activeTopic.loading && !activeTopic.error && (
        <div className="getnote-topic-scope-selector" role="group" aria-label={t('topicPicker.scope')}>
          <label>
            <input
              data-topic-scope-all
              type="radio"
              name="topicSyncScope"
              checked={syncAllActive}
              onChange={() => setSyncAllActive(true)}
            />
            <span>{t('topicPicker.scope.all')}</span>
          </label>
          <label>
            <input
              data-topic-scope-selected
              type="radio"
              name="topicSyncScope"
              checked={!syncAllActive}
              onChange={() => setSyncAllActive(false)}
            />
            <span>{t('topicPicker.scope.selected')}</span>
          </label>
        </div>
      )}
      {activeTopic && syncAllActive && (
        <div className="getnote-input-hint getnote-topic-scope-hint">{t('topicPicker.scope.allHint')}</div>
      )}
      {activeTopic && !syncAllActive && !activeTopic.loading && !activeTopic.error && activeTopic.contents.length > 0 && (
        <div className="getnote-topic-filter-bar">
          {bloggers.length > 0 && (
            <select
              data-topic-blogger-filter
              value={bloggerFilter}
              onChange={(event) => {
                setSelectAllActive(false);
                setBloggerFilter((event.target as HTMLSelectElement).value);
              }}
            >
              <option value="">{t('topicPicker.allBloggers')}</option>
              {bloggers.map(blogger => <option key={blogger} value={blogger}>{blogger}</option>)}
            </select>
          )}
          <input
            data-topic-search
            type="text"
            className="getnote-input"
            placeholder={t('picker.search')}
            value={searchQuery}
            onInput={(event) => {
              setSelectAllActive(false);
              setSearchQuery((event.target as HTMLInputElement).value);
            }}
          />
        </div>
      )}
      {!activeTopic && !topicsLoading && !topicsError && topics.length > 0 && (
        <div className="getnote-topic-list-search">
          <input
            data-topic-list-search
            type="text"
            className="getnote-input"
            placeholder={t('topicPicker.search')}
            value={topicSearchQuery}
            onInput={(event) => setTopicSearchQuery((event.target as HTMLInputElement).value)}
          />
        </div>
      )}
      <div className="getnote-picker-body">
        {!activeTopic && topicsLoading && (
          <div className="getnote-picker-skeleton">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="getnote-skeleton-row">
                <div className="getnote-skeleton-checkbox" />
                <div className="getnote-skeleton-lines">
                  <div className="getnote-skeleton-line getnote-skeleton-line-primary" />
                </div>
              </div>
            ))}
          </div>
        )}
        {!activeTopic && topicsError && !topicsLoading && (
          <div className="getnote-picker-error">
            {topicsError} <button onClick={loadTopics}>{t('topicPicker.retry')}</button>
          </div>
        )}
        {!activeTopic && !topicsLoading && !topicsError && [
          { label: t('topicPicker.created'), topics: createdTopics },
          { label: t('topicPicker.subscribed'), topics: subscribedTopics },
        ].map(group => group.topics.length > 0 && (
          <div className="getnote-topic-group" key={group.label}>
            <div className="getnote-topic-group-title">{group.label}</div>
            {group.topics.map(topic => {
          const data = topicData[topic.topic_id];
          return (
            <button
              key={topic.topic_id}
              className="getnote-topic-row"
              data-topic-id={topic.topic_id}
              data-topic-source={topic.source}
              onClick={() => void openTopic(topic)}
            >
              <span className="getnote-topic-name">{topic.name || topic.topic_id}</span>
              <span className="getnote-topic-row-meta">
                {data && data.contents.length > 0
                  ? t('topicPicker.loaded', { count: data.contents.length })
                  : t('topicPicker.chooseTopic')}
              </span>
              <span className="getnote-topic-arrow" aria-hidden="true">›</span>
            </button>
          );
            })}
          </div>
        ))}
        {!activeTopic && !topicsLoading && !topicsError && topics.length === 0 && (
          <div className="getnote-picker-empty">{t('topicPicker.empty')}</div>
        )}
        {activeTopic && activeTopic.loading && (
          <div className="getnote-picker-skeleton">
            {[1, 2, 3].map(i => (
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
        {activeTopic?.error && !activeTopic.loading && (
          <div className="getnote-picker-error">
            {activeTopic.error}{' '}
            <button onClick={() => void openTopic(activeTopic.topic)}>{t('topicPicker.retry')}</button>
          </div>
        )}
        {activeTopic && !activeTopic.loading && !activeTopic.error && activeTopic.contents.length === 0 && (
          <div className="getnote-picker-empty">{t('topicPicker.emptyContent')}</div>
        )}
        {activeTopic && !syncAllActive && !activeTopic.loading && !activeTopic.error && visibleItems.map(item => (
          <ContentRow key={item.note_id} item={item} checked={selectedNoteIds.has(item.note_id)} onChange={handleCheck} />
        ))}
        {activeTopic && !syncAllActive && !activeTopic.loading && !activeTopic.error && activeTopic.contents.length > 0 && visibleItems.length === 0 && (
          <div className="getnote-picker-empty">{t('picker.noMatch')}</div>
        )}
        {activeTopic && !syncAllActive && !activeTopic.loading && !activeTopic.error && activeTopic.nextCursor && (
          <div className="getnote-picker-loadmore">
            <button
              data-topic-load-more
              disabled={activeTopic.loadingMore}
              onClick={() => void loadTopicPage(activeTopic.topic, activeTopic.nextCursor)}
            >
              {activeTopic.loadingMore ? t('topicPicker.loadingMore') : t('topicPicker.loadMore')}
            </button>
          </div>
        )}
      </div>
      <div className="getnote-picker-footer">
        <span className="getnote-picker-count">
          {syncAllActive ? t('topicPicker.scope.allSelected') : t('topicPicker.selected', { count: selectedNoteIds.size })}
          {!syncAllActive && totalItems > 0 && <span style="margin-left: 12px;">{t('topicPicker.loaded', { count: totalItems })}</span>}
        </span>
        <div className="getnote-picker-btns">
          <button className="mod-cancel" onClick={onCancel}>{t('topicPicker.cancel')}</button>
          <button className="mod-cta" disabled={!syncAllActive && selectedNoteIds.size === 0} onClick={handleConfirm}>
            {t('topicPicker.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
