import { useState, useEffect, useCallback } from 'preact/hooks';
import type { AuthMode, SubscribedTopic } from '../types';
import type { ContentPreview } from '../api';
import { fetchSubscribedTopics, fetchTopicContentPreviews } from '../api';
import { t } from '../i18n';

interface TopicData {
  topic: SubscribedTopic;
  contents: ContentPreview[];
  loading: boolean;
  error?: string;
  expanded: boolean;
}

interface TopicPickerModalProps {
  onConfirm: (selectedNoteIds: string[]) => void;
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
  const [expandedTopic, setExpandedTopic] = useState<string | null>(null);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<string>>(new Set());

  const loadTopics = useCallback(() => {
    setTopicsLoading(true);
    setTopicsError(null);
    void (async () => {
      try {
        const result = await fetchSubscribedTopics({ token, clientId, authMode, signal: abortSignal });
        setTopics(result);
        const init: Record<string, TopicData> = {};
        for (const topic of result) {
          init[topic.topic_id] = { topic, contents: [], loading: false, expanded: false };
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

  const expandTopic = async (topic: SubscribedTopic) => {
    const wasExpanded = expandedTopic === topic.topic_id;
    if (wasExpanded) {
      setExpandedTopic(null);
      return;
    }
    setExpandedTopic(topic.topic_id);
    const data = topicData[topic.topic_id];
    if (!data || data.contents.length > 0) return;

    setTopicData(prev => ({ ...prev, [topic.topic_id]: { ...prev[topic.topic_id], loading: true, expanded: true } }));
    try {
      const contents = await fetchTopicContentPreviews(topic.topic_id, topic.name, token, clientId, authMode, abortSignal);
      setTopicData(prev => ({
        ...prev,
        [topic.topic_id]: { ...prev[topic.topic_id], contents, loading: false, expanded: true },
      }));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      setTopicData(prev => ({
        ...prev,
        [topic.topic_id]: { ...prev[topic.topic_id], loading: false, error: err instanceof Error ? err.message : String(err), expanded: true },
      }));
    }
  };

  const handleCheck = (noteId: string, checked: boolean) => {
    setSelectedNoteIds(prev => {
      const next = new Set(prev);
      if (checked) next.add(noteId);
      else next.delete(noteId);
      return next;
    });
  };

  const handleConfirm = () => onConfirm(Array.from(selectedNoteIds));

  const totalItems = Object.values(topicData).reduce((sum, d) => sum + d.contents.length, 0);

  return (
    <div className="getnote-picker">
      <div className="getnote-picker-header">
        <span className="getnote-picker-header-title">{t('topicPicker.title')}</span>
      </div>
      <div className="getnote-picker-body">
        {topicsLoading && (
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
        {topicsError && !topicsLoading && (
          <div className="getnote-picker-error">
            {topicsError} <button onClick={loadTopics}>{t('topicPicker.retry')}</button>
          </div>
        )}
        {!topicsLoading && !topicsError && topics.map(topic => {
          const data = topicData[topic.topic_id];
          const isExpanded = expandedTopic === topic.topic_id;
          return (
            <div key={topic.topic_id} className="getnote-topic-section">
              <div className="getnote-topic-header" onClick={() => expandTopic(topic)}>
                <span className="getnote-topic-arrow">{isExpanded ? '▼' : '▶'}</span>
                <span className="getnote-topic-name">{topic.name || topic.topic_id}</span>
                {data && data.contents.length > 0 && (
                  <span className="getnote-topic-count">({data.contents.length})</span>
                )}
              </div>
              {isExpanded && (
                <div className="getnote-topic-body">
                  {data?.loading && (
                    <div className="getnote-picker-skeleton" style="padding: 8px 0 8px 24px;">
                      {[1, 2].map(i => (
                        <div key={i} className="getnote-skeleton-row">
                          <div className="getnote-skeleton-checkbox" />
                          <div className="getnote-skeleton-lines">
                            <div className="getnote-skeleton-line getnote-skeleton-line-primary" />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {data?.error && !data.loading && (
                    <div className="getnote-picker-error" style="padding: 8px 0 8px 24px;">{data.error}</div>
                  )}
                  {!data?.loading && !data?.error && data && data.contents.length === 0 && (
                    <div className="getnote-picker-empty" style="padding: 8px 0 8px 24px;">
                      {t('topicPicker.empty')}
                    </div>
                  )}
                  {!data?.loading && data?.contents.map(item => (
                    <div key={item.note_id} style="padding-left: 24px;">
                      <ContentRow item={item} checked={selectedNoteIds.has(item.note_id)} onChange={handleCheck} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        {!topicsLoading && !topicsError && topics.length === 0 && (
          <div className="getnote-picker-empty">{t('topicPicker.empty')}</div>
        )}
      </div>
      <div className="getnote-picker-footer">
        <span className="getnote-picker-count">
          {t('topicPicker.selected', { count: selectedNoteIds.size })}
          {totalItems > 0 && <span style="margin-left: 12px;">{t('topicPicker.total', { count: totalItems })}</span>}
        </span>
        <div className="getnote-picker-btns">
          <button className="mod-cancel" onClick={onCancel}>{t('topicPicker.cancel')}</button>
          <button className="mod-cta" disabled={selectedNoteIds.size === 0} onClick={handleConfirm}>
            {t('topicPicker.confirm', { count: selectedNoteIds.size })}
          </button>
        </div>
      </div>
    </div>
  );
}