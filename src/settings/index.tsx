import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { SettingItem } from './setting-item';
import { SyncButton } from './sync-button';
import { OAuthButton } from './oauth-button';
import { openSyncHistoryModal } from '../ui/sync-history-modal';
import { NoteTypeSelect } from '../ui/note-type-select';
import { TagSelect } from '../ui/tag-select';
import { KnowledgeBaseSelect } from '../ui/knowledge-base-select';
import { Toggle } from './toggle';
import { getAuthCredentials, type AuthMode, type Settings, type SyncHistoryEntry, type SyncProgressDetail } from '../types';
import { App, AbstractInputSuggest } from 'obsidian';
import { fetchNotes } from '../api';
import { t } from '../i18n';
import { ExternalLink } from './external-link';

class FolderSuggest extends AbstractInputSuggest<string> {
  private el: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement, onSelect: (value: string) => void) {
    super(app, inputEl);
    this.el = inputEl;
    this.onSelect((value) => onSelect(value));
  }

  getSuggestions(query: string): string[] {
    return this.app.vault
      .getAllFolders()
      .map(f => f.path)
      .filter(path => !query || path.toLowerCase().includes(query.toLowerCase()));
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.el.value = value;
    this.el.dispatchEvent(new Event('input'));
    this.close();
  }
}

class TemplateFileSuggest extends AbstractInputSuggest<string> {
  private el: HTMLInputElement;

  constructor(app: App, inputEl: HTMLInputElement, onSelect: (value: string) => void) {
    super(app, inputEl);
    this.el = inputEl;
    this.onSelect((value) => onSelect(value));
  }

  getSuggestions(query: string): string[] {
    const normalizedQuery = (query ?? '').trim().toLowerCase();
    return Array.from(new Set(
      this.app.vault
        .getMarkdownFiles()
        .map(file => file.path)
        .filter(Boolean),
    ))
      .filter(path => !normalizedQuery || path.toLowerCase().includes(normalizedQuery))
      .sort((a, b) => a.localeCompare(b))
      .slice(0, 50);
  }

  renderSuggestion(value: string, el: HTMLElement): void {
    el.setText(value);
  }

  selectSuggestion(value: string): void {
    this.el.value = value;
    this.el.dispatchEvent(new Event('input'));
    this.close();
  }
}

interface SettingsComponentProps {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  startSync: () => void;
  isSyncing: boolean;
  openNotePicker: () => void;
  startSubscribedKnowledgeSync: () => void;
  openLocalUpload: () => void;
  startAutoSync: () => void;
  stopAutoSync: () => void;
  cancelSync: () => void;
  app: App;
  syncProgress?: SyncProgressDetail;
  lastSyncTime?: number;
  syncHistory?: SyncHistoryEntry[];
  initialKnowledgeBaseCache?: { entries: Array<{ topicId: string; name: string; source?: 'subscribed' | 'created' }>; cacheUpdatedAt?: number };
}

function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function SettingsComponent({
  settings,
  updateSetting,
  startSync,
  isSyncing,
  openNotePicker,
  startSubscribedKnowledgeSync,
  openLocalUpload,
  startAutoSync,
  stopAutoSync,
  cancelSync,
  app,
  syncProgress,
  lastSyncTime,
  syncHistory = [],
  initialKnowledgeBaseCache,
}: SettingsComponentProps) {
  const [authMode, setAuthMode] = useState<AuthMode>(settings.authMode);
  const initialOpenApiToken = settings.openApiToken || (settings.authMode === 'openapi' ? settings.apiToken : '');
  const initialOpenApiClientId = settings.openApiClientId || settings.clientId;
  const initialWebApiToken = settings.webApiToken || (settings.authMode === 'web' ? settings.apiToken : '');
  const [apiTokenOpenapi, setApiTokenOpenapi] = useState(initialOpenApiToken);
  const [clientIdOpenapi, setClientIdOpenapi] = useState(initialOpenApiClientId);
  const [apiTokenWeb, setApiTokenWeb] = useState(initialWebApiToken);
  const apiTokenOpenapiRef = useRef(initialOpenApiToken);
  const apiTokenWebRef = useRef(initialWebApiToken);
  const [showApiToken, setShowApiToken] = useState(false);
  const [folderName, setFolderName] = useState(settings.folderName);
  const [filenamePrefix, setFilenamePrefix] = useState(settings.filenamePrefix);
  const [templateFilePath, setTemplateFilePath] = useState(settings.templateFilePath);
  // Only show actual lastSyncEndTimestamp — do NOT fallback to syncStartDate
  const lastSyncedTo = settings.lastSyncEndTimestamp || '';
  const [scheduledEnabled, setScheduledEnabled] = useState(settings.scheduledSync.enabled);
  const [scheduledDetailsOpen, setScheduledDetailsOpen] = useState(false);
  const [scheduledNoteTypes, setScheduledNoteTypes] = useState<string[] | undefined>(settings.scheduledSync.enabledNoteTypes);
  const [syncTags, setSyncTags] = useState<string[]>(settings.syncTags ?? []);
  const [scheduledKnowledgeBases, setScheduledKnowledgeBases] = useState<string[]>(settings.scheduledSync.syncKnowledgeBases ?? []);
  const [attachmentDetailsOpen, setAttachmentDetailsOpen] = useState(false);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionErrorMsg, setConnectionErrorMsg] = useState('');
  const [connectionExpiryMin, setConnectionExpiryMin] = useState<number | null>(null);
  const [intervalWarning, setIntervalWarning] = useState(false);
  const credentials = getAuthCredentials({ ...settings, authMode, openApiToken: apiTokenOpenapi, openApiClientId: clientIdOpenapi, webApiToken: apiTokenWeb });
  const [resetDialogOpen, setResetDialogOpen] = useState(false);
  const [pendingStartDate, setPendingStartDate] = useState(settings.syncStartDate);

  const folderInputRef = useRef<HTMLInputElement>(null);
  const templateFileInputRef = useRef<HTMLInputElement>(null);

  // Attachment toggles are now driven by declarative Preact state (no more
  // imperative useRef + ToggleComponent.useEffect plumbing). The previous
  // version had two competing useEffects (master + reactive sync) calling
  // setValue on the same imperative toggle, which intermittently reverted
  // the user's click on the first tap. A single source of truth
  // (settings.attachmentImport) keeps master and children consistent.
  const attachmentImport = settings.attachmentImport ?? {};
  const attachmentKinds = ['image', 'audio', 'video', 'document'] as const;
  const allAttachmentsOn = attachmentKinds.every(
    k => attachmentImport[k as 'image' | 'audio' | 'video' | 'document'] !== false,
  );
  const handleMasterAttachmentChange = (value: boolean) => {
    updateSetting('attachmentImport', {
      image: value,
      audio: value,
      video: value,
      document: value,
    });
  };
  const handleChildAttachmentChange = (kind: 'image' | 'audio' | 'video' | 'document', value: boolean) => {
    if (!allAttachmentsOn) return; // disabled when master is off
    updateSetting('attachmentImport', {
      ...attachmentImport,
      [kind]: value,
    });
  };

  useEffect(() => {
    if (!settings.syncStartDate && !settings.lastSyncEndTimestamp) {
      updateSetting('syncStartDate', getLocalDateInputValue());
    }
  }, []);

  // Lazily seed the tag cache from the first page of notes the first time
  // the settings tab is opened with an empty cache. This avoids an empty
  // "Tags" dropdown before the user has run a sync. We only run once per
  // session (guarded by lastUpdated === 0); later runs come from the sync
  // engine populating observedTags.
  useEffect(() => {
    const cache = settings.tagCache;
    if (!cache || (cache.tags && cache.tags.length > 0)) return;
    if (cache?.lastUpdated && cache.lastUpdated > 0) return;
    if (!credentials.token) return;
    if (credentials.authMode !== 'web' && !credentials.clientId) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await fetchNotes({
          token: credentials.token,
          clientId: credentials.clientId,
          authMode: credentials.authMode,
          sinceId: '0',
        });
        if (cancelled) return;
        const observed = result.notes.flatMap(n => (n.tags ?? []).map(t => t.name)).filter(Boolean);
        if (observed.length === 0) return;
        updateSetting('tagCache', {
          tags: Array.from(new Set(observed)).sort((a, b) => a.localeCompare(b)),
          lastUpdated: Date.now(),
        });
      } catch {
        // Network failure is non-fatal — user can still sync to populate.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const inputEl = folderInputRef.current;
    if (!inputEl) return;

    const suggest = new FolderSuggest(app, inputEl, (value) => {
      setFolderName(value);
      updateSetting('folderName', value);
    });

    return () => suggest.close();
  }, [app]);

  useEffect(() => {
    const inputEl = templateFileInputRef.current;
    if (!inputEl) return;

    const suggest = new TemplateFileSuggest(app, inputEl, (value) => {
      setTemplateFilePath(value);
      updateSetting('templateFilePath', value);
    });

    return () => suggest.close();
  }, [app]);

  const handleAuthModeChange = useCallback(
    (value: AuthMode) => {
      setAuthMode(value);
      updateSetting('authMode', value);
      updateSetting('apiToken', (value === 'web' ? apiTokenWebRef.current : apiTokenOpenapiRef.current).trim());
      if (value === 'openapi') updateSetting('clientId', clientIdOpenapi.trim());
    },
    [clientIdOpenapi, updateSetting]
  );

  const handleApiTokenOpenapiChange = useCallback(
    (value: string) => {
      apiTokenOpenapiRef.current = value;
      setApiTokenOpenapi(value);
      updateSetting('openApiToken', value.trim());
      if (authMode === 'openapi') updateSetting('apiToken', value.trim());
    },
    [authMode, updateSetting]
  );

  const handleClientIdOpenapiChange = useCallback(
    (value: string) => {
      setClientIdOpenapi(value);
      updateSetting('openApiClientId', value.trim());
      updateSetting('clientId', value.trim());
    },
    [updateSetting]
  );

  const handleApiTokenWebChange = useCallback(
    (value: string) => {
      apiTokenWebRef.current = value;
      setApiTokenWeb(value);
      updateSetting('webApiToken', value.trim());
      if (authMode === 'web') updateSetting('apiToken', value.trim());
    },
    [authMode, updateSetting]
  );

  const handleFolderChange = useCallback(
    (value: string) => {
      const clean = value.replace(/[\\:*?"<>|]/g, '').trim() || t('settings.folder.placeholder');
      setFolderName(clean);
      updateSetting('folderName', clean);
    },
    [updateSetting]
  );

  const handleFilenamePrefixChange = useCallback(
    (value: string) => {
      setFilenamePrefix(value);
      updateSetting('filenamePrefix', value);
    },
    [updateSetting]
  );

  const handleTemplateFilePathChange = useCallback(
    (value: string) => {
      setTemplateFilePath(value);
      updateSetting('templateFilePath', value.trim());
    },
    [updateSetting]
  );

  const handleSyncStartDateChange = (value: string) => {
    updateSetting('syncStartDate', value);
  };

  const handleResetCheckpointClick = () => {
    if (isSyncing) return;
    setPendingStartDate(getLocalDateInputValue());
    setResetDialogOpen(true);
  };

  const handleResetSave = () => {
    if (isSyncing) return;
    // Reject empty input — silently writing '' would cause the sync engine to
    // fall back to maxDays (default 30), surprising users who simply cleared
    // the field by accident. Keep the previous syncStartDate unchanged.
    if (pendingStartDate === '') {
      setResetDialogOpen(false);
      return;
    }
    updateSetting('lastSyncEndTimestamp', '');
    if (pendingStartDate !== settings.syncStartDate) {
      updateSetting('syncStartDate', pendingStartDate);
    }
    setResetDialogOpen(false);
  };

  const handleResetCancel = () => {
    setPendingStartDate(settings.syncStartDate);
    setResetDialogOpen(false);
  };

  const handleScheduledEnabled = (checked: boolean) => {
    setScheduledEnabled(checked);
    updateSetting('scheduledSync', {
      ...settings.scheduledSync,
      enabledNoteTypes: scheduledNoteTypes,
      syncKnowledgeBases: scheduledKnowledgeBases,
      enabled: checked,
    });
    if (checked) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
  };

  const handleScheduledInterval = (value: string) => {
    const n = parseInt(value, 10);
    if (isNaN(n) || n < 5) {
      setIntervalWarning(true);
      updateSetting('scheduledSync', {
        ...settings.scheduledSync,
        enabledNoteTypes: scheduledNoteTypes,
        syncKnowledgeBases: scheduledKnowledgeBases,
        intervalMinutes: 5,
      });
      window.setTimeout(() => setIntervalWarning(false), 3000);
    } else {
      updateSetting('scheduledSync', {
        ...settings.scheduledSync,
        enabledNoteTypes: scheduledNoteTypes,
        syncKnowledgeBases: scheduledKnowledgeBases,
        intervalMinutes: n,
      });
    }
  };

  const handleScheduledOnStart = (checked: boolean) => {
    updateSetting('scheduledSync', {
      ...settings.scheduledSync,
      enabledNoteTypes: scheduledNoteTypes,
      syncKnowledgeBases: scheduledKnowledgeBases,
      syncOnStart: checked,
    });
  };

  const handleScheduledNoteTypes = (value: string[] | undefined) => {
    setScheduledNoteTypes(value);
    updateSetting('scheduledSync', { ...settings.scheduledSync, enabledNoteTypes: value, syncKnowledgeBases: scheduledKnowledgeBases });
  };

  const handleScheduledKnowledgeBases = (value: string[]) => {
    setScheduledKnowledgeBases(value);
    updateSetting('scheduledSync', {
      ...settings.scheduledSync,
      enabledNoteTypes: scheduledNoteTypes,
      syncKnowledgeBases: value,
    });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionErrorMsg('');
    setConnectionExpiryMin(null);
    const token = authMode === 'web' ? apiTokenWeb.trim() : apiTokenOpenapi.trim();
    const cid = authMode === 'web' ? '' : clientIdOpenapi.trim();
    try {
      await fetchNotes({
        token,
        clientId: cid,
        authMode,
        sinceId: '0',
        limit: 1,
      });
      if (authMode === 'web') {
        try {
          const tokenStr = token.replace(/^Bearer\s+/i, '');
          const payload: unknown = JSON.parse(atob(tokenStr.split('.')[1]));
          if (payload && typeof payload === 'object' && 'exp' in payload) {
            const exp = (payload as { exp: unknown }).exp;
            if (typeof exp === 'number') {
              const remaining = Math.round((exp - Date.now() / 1000) / 60);
              if (remaining > 0) setConnectionExpiryMin(remaining);
            }
          }
        } catch { /* ignore */ }
      }
      setConnectionStatus('success');
      window.setTimeout(() => { setConnectionStatus('idle'); setConnectionExpiryMin(null); }, 4000);
    } catch (err) {
      setConnectionStatus('error');
      setConnectionErrorMsg(err instanceof Error ? err.message : String(err));
      window.setTimeout(() => { setConnectionStatus('idle'); setConnectionErrorMsg(''); }, 4000);
    } finally {
      setTestingConnection(false);
    }
  };

  const currentApiToken = authMode === 'web' ? apiTokenWeb : apiTokenOpenapi;
  const currentClientId = clientIdOpenapi;

  const hasCredentials = authMode === 'web'
    ? Boolean(apiTokenWeb.trim())
    : Boolean(apiTokenOpenapi.trim() && clientIdOpenapi.trim());
  const { scheduledSync } = settings;
  const currentSyncHistory = syncHistory.length > 0 ? syncHistory : settings.syncHistory;
  const syncStatusRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isSyncing) return;
    syncStatusRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [isSyncing, syncProgress?.message, syncProgress?.count, syncProgress?.percent]);

  // Format last sync time
  const formatLastSync = (timestamp?: number): string => {
    if (!timestamp) return t('settings.lastSync.never');
    const diff = Date.now() - timestamp;
    const minutes = Math.floor(diff / 60000);
    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}小时前`;
    return `${Math.floor(hours / 24)}天前`;
  };

  // Format an ISO datetime to a local-time string that includes a timezone
  // marker. The API returns UTC values (e.g. "...Z") and the previous
  // implementation silently dropped the offset, so a user in UTC+8 saw the
  // checkpoint displayed 8 hours ahead of its true local meaning. Parsing
  // via `new Date()` and rendering with `toLocaleString()` (with
  // timeZoneName='short') converts the timestamp to the viewer's local time
  // and embeds the timezone (e.g. "6/12/2026, 11:30:00 PM GMT+8").
  const formatCheckpoint = (iso: string): string => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, { timeZoneName: 'short' });
  };

  // Progress bar with # characters
  const renderProgressBar = (percent: number): string => {
    const total = 16;
    const filled = Math.round((percent / 100) * total);
    return '[' + '#'.repeat(filled) + '░'.repeat(total - filled) + ']';
  };

  return (
    <div className="getnote-settings-react">
      <div className="getnote-settings-header">
        <h2>{t('settings.title')} <span className="getnote-settings-author">by 关山的月儿</span></h2>
        <p className="getnote-settings-desc">
          {t('settings.desc')} <ExternalLink href={t('settings.communityUrl')}>{t('settings.community')}</ExternalLink>
        </p>
      </div>

      <div className="getnote-onboarding">{t('settings.onboarding')}</div>

      {/* 凭证设置 */}
      <SettingItem
        name={t('settings.credentials.label')}
        description={
          authMode === 'web'
            ? <span>{t('settings.credentials.webTip')} <ExternalLink href={t('settings.webTipHelpUrl')}>{t('settings.webTipHelp')}</ExternalLink></span>
            : t('settings.credentials.tip')
        }
      >
        <div className="getnote-credentials-control">
          <div className="getnote-primary-input-stack">
            <div className="getnote-authmode-toggle">
              <label className={`getnote-authmode-btn${authMode === 'openapi' ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="authMode"
                  value="openapi"
                  checked={authMode === 'openapi'}
                  onChange={() => handleAuthModeChange('openapi')}
                />
                {t('settings.authMode.openapi')}
              </label>
              <label className={`getnote-authmode-btn${authMode === 'web' ? ' active' : ''}`}>
                <input
                  type="radio"
                  name="authMode"
                  value="web"
                  checked={authMode === 'web'}
                  onChange={() => handleAuthModeChange('web')}
                />
                {t('settings.authMode.web')}
              </label>
            </div>
            {authMode === 'openapi' && (
              <>
                <input
                  type="text"
                  className="getnote-input"
                  placeholder={t('settings.clientId.placeholder')}
                  value={currentClientId}
                  onInput={(e) => handleClientIdOpenapiChange((e.target as HTMLInputElement).value)}
                />
                <div className="getnote-input-row">
                  <input
                    type={showApiToken ? 'text' : 'password'}
                    className="getnote-input"
                    placeholder={t('settings.apiToken.placeholder')}
                    value={currentApiToken}
                    onInput={(e) => handleApiTokenOpenapiChange((e.target as HTMLInputElement).value)}
                  />
                  <button
                    type="button"
                    className="getnote-input-toggle"
                    onClick={() => setShowApiToken(!showApiToken)}
                    title={showApiToken ? t('settings.hideToken') : t('settings.showToken')}
                  >
                    {showApiToken ? '🔒' : '👁'}
                  </button>
                </div>
              </>
            )}
            {authMode === 'web' && (
              <>
                <div className="getnote-input-row">
                  <input
                    type={showApiToken ? 'text' : 'password'}
                    className="getnote-input"
                    placeholder={t('settings.webToken.placeholder')}
                    value={currentApiToken}
                    onInput={(e) => handleApiTokenWebChange((e.target as HTMLInputElement).value)}
                  />
                  <button
                    type="button"
                    className="getnote-input-toggle"
                    onClick={() => setShowApiToken(!showApiToken)}
                    title={showApiToken ? t('settings.hideToken') : t('settings.showToken')}
                  >
                    {showApiToken ? '🔒' : '👁'}
                  </button>
                </div>
              </>
            )}
          </div>
          <div className="getnote-credentials-actions">
            {authMode !== 'web' && (
              <OAuthButton
                onAuthorize={(token, cid) => {
                  setApiTokenOpenapi(token);
                  setClientIdOpenapi(cid);
                  apiTokenOpenapiRef.current = token;
                  updateSetting('openApiToken', token);
                  updateSetting('openApiClientId', cid);
                  updateSetting('apiToken', token);
                  updateSetting('clientId', cid);
                }}
                onTestConnection={async (token, cid) => {
                  try {
                    await fetchNotes({ token, clientId: cid, authMode: 'openapi', sinceId: '0', limit: 1 });
                    return { isMemberError: false, message: '' };
                  } catch (err) {
                    const msg = err instanceof Error ? err.message : String(err);
                    const isMemberError = msg.includes('10201') || msg.includes('仅对会员开放') || msg.includes('not_member');
                    return { isMemberError, message: isMemberError ? t('settings.connectionErrorMemberHint') : msg };
                  }
                }}
              />
            )}
            <button
              className="mod-secondary getnote-credential-action-button"
              disabled={testingConnection}
              onClick={() => {
                void handleTestConnection();
              }}
            >
              {testingConnection ? t('settings.testingConnection') : t('settings.testConnection')}
            </button>
          </div>
          {connectionStatus === 'success' && (
            <span className="getnote-connection-success">
              {connectionExpiryMin !== null
                ? t('settings.connectionSuccessWithExpiry', { minutes: connectionExpiryMin })
                : t('settings.connectionSuccess')}
            </span>
          )}
          {connectionStatus === 'error' && (
            <span className="getnote-connection-error">
              {t('settings.connectionError')}{connectionErrorMsg ? `: ${connectionErrorMsg}` : ''}
            </span>
          )}
        </div>
      </SettingItem>

      {/* 目标文件夹 */}
      <SettingItem
        name={t('settings.folder.label')}
        description={t('settings.folder.desc')}
      >
        <input
          ref={folderInputRef}
          type="text"
          className="getnote-input"
          placeholder={t('settings.folder.placeholder')}
          value={folderName}
          onInput={(e) => handleFolderChange((e.target as HTMLInputElement).value)}
        />
      </SettingItem>

      {/* 文件名前缀 */}
      <SettingItem
        name={t('settings.prefix.label')}
        description={t('settings.prefix.desc')}
      >
        <input
          type="text"
          className="getnote-input"
          placeholder={t('settings.prefix.placeholder')}
          value={filenamePrefix}
          onInput={(e) => handleFilenamePrefixChange((e.target as HTMLInputElement).value)}
        />
      </SettingItem>

      <SettingItem
        name={t('settings.templateFile.label')}
        description={t('settings.templateFile.desc')}
      >
        <input
          ref={templateFileInputRef}
          type="text"
          className="getnote-input"
          placeholder={t('settings.templateFile.placeholder')}
          value={templateFilePath}
          onInput={(e) => handleTemplateFilePathChange((e.target as HTMLInputElement).value)}
        />
      </SettingItem>

      <div className="getnote-settings-divider" />

      <SettingItem
        name={t('settings.scheduled.label')}
        description={t('settings.scheduled.desc')}
      >
        <div className="getnote-scheduled-control">
          <div className="getnote-scheduled-row getnote-scheduled-master-row">
            <span className="getnote-scheduled-row-label">{t('settings.scheduled.enabled')}</span>
            <span className="getnote-scheduled-row-control">
              <Toggle
                value={scheduledEnabled}
                onChange={handleScheduledEnabled}
              />
              {scheduledEnabled && (
                <button
                  type="button"
                  className="getnote-inline-disclosure"
                  aria-expanded={scheduledDetailsOpen}
                  onClick={() => setScheduledDetailsOpen(prev => !prev)}
                >
                  {scheduledDetailsOpen ? t('settings.collapse') : t('settings.expand')}
                </button>
              )}
            </span>
          </div>
          <div
            className={`getnote-scheduled-rows${scheduledEnabled && scheduledDetailsOpen ? '' : ' getnote-hidden'}`}
          >
            <div className="getnote-scheduled-row">
              <span className="getnote-scheduled-row-label">{t('settings.scheduled.interval')}</span>
              <span className="getnote-scheduled-row-control">
                <input
                  type="number"
                  min="5"
                  value={scheduledSync.intervalMinutes}
                  onInput={(e) => handleScheduledInterval((e.target as HTMLInputElement).value)}
                />
              </span>
            </div>
            {intervalWarning && (
              <div className="getnote-input-hint getnote-input-hint-error">
                {t('settings.interval.minWarning')}
              </div>
            )}
            <div className="getnote-scheduled-row">
              <span className="getnote-scheduled-row-label">{t('settings.scheduled.onStart')}</span>
              <span className="getnote-scheduled-row-control">
                <Toggle
                  value={scheduledSync.syncOnStart}
                  onChange={handleScheduledOnStart}
                />
              </span>
            </div>
            <div className="getnote-scheduled-row">
              <span className="getnote-scheduled-row-label">{t('settings.noteTypes.label')}</span>
              <span className="getnote-scheduled-row-control">
                <NoteTypeSelect value={scheduledNoteTypes} onChange={handleScheduledNoteTypes} />
              </span>
            </div>
            <div className="getnote-scheduled-row">
              <span className="getnote-scheduled-row-label">{t('settings.syncTags.label')}</span>
              <span className="getnote-scheduled-row-control">
                <TagSelect
                  value={syncTags}
                  options={settings.tagCache?.tags ?? []}
                  onChange={(value) => {
                    setSyncTags(value);
                    updateSetting('syncTags', value);
                  }}
                  onCreateTag={(tag) => {
                    const existing = settings.tagCache?.tags ?? [];
                    if (existing.some(t => t.toLowerCase() === tag.toLowerCase())) return;
                    const merged = Array.from(new Set([...existing, tag])).sort((a, b) => a.localeCompare(b));
                    updateSetting('tagCache', { tags: merged, lastUpdated: Date.now() });
                  }}
                  placeholder={t('settings.syncTags.placeholder')}
                />
              </span>
            </div>
            <div className="getnote-input-hint">{t('settings.syncTags.desc')}</div>
            <div className="getnote-scheduled-row">
              <span className="getnote-scheduled-row-label">{t('settings.scheduled.syncKnowledgeBases')}</span>
              <span className="getnote-scheduled-row-control">
                <KnowledgeBaseSelect
                  value={scheduledKnowledgeBases}
                  onChange={handleScheduledKnowledgeBases}
                  hasCredentials={hasCredentials}
                  token={credentials.token}
                  clientId={credentials.clientId}
                  authMode={credentials.authMode}
                  initialCache={initialKnowledgeBaseCache ?? settings.knowledgeBaseCache}
                  onCacheUpdate={(snapshot) => updateSetting('knowledgeBaseCache', snapshot)}
                />
              </span>
            </div>
            <div className="getnote-input-hint">{t('settings.scheduled.syncKnowledgeBases.hint')}</div>
            <div className="getnote-scheduled-row getnote-scheduled-date-row">
              <span className="getnote-scheduled-row-label">
                {resetDialogOpen
                  ? t('settings.scheduled.resetStartDate')
                  : (lastSyncedTo ? t('settings.syncStartDate.lastSyncedTo') : t('settings.syncStartDate.label'))}
              </span>
              <span className="getnote-scheduled-row-control">
                {resetDialogOpen ? (
                  <>
                    <input
                      type="date"
                      className="getnote-input getnote-date-input"
                      value={pendingStartDate}
                      onChange={(e) => setPendingStartDate((e.target as HTMLInputElement).value)}
                    />
                    <button
                      type="button"
                      className="getnote-button getnote-button-secondary"
                      onClick={handleResetCancel}
                    >
                      {t('settings.scheduled.resetCancel')}
                    </button>
                    <button
                      type="button"
                      className="getnote-button getnote-button-primary"
                      onClick={handleResetSave}
                      disabled={isSyncing}
                    >
                      {t('settings.scheduled.resetSave')}
                    </button>
                  </>
                ) : lastSyncedTo ? (
                  <>
                    <span className="getnote-muted-text">{formatCheckpoint(lastSyncedTo)}</span>
                    <button
                      type="button"
                      className="getnote-button getnote-button-secondary"
                      onClick={handleResetCheckpointClick}
                      disabled={isSyncing}
                    >
                      {t('settings.scheduled.resetButton')}
                    </button>
                  </>
                ) : (
                  <input
                    type="date"
                    className="getnote-input getnote-date-input"
                    value={settings.syncStartDate}
                    onChange={(e) => handleSyncStartDateChange((e.target as HTMLInputElement).value)}
                  />
                )}
              </span>
            </div>
            {resetDialogOpen ? (
              <div className="getnote-input-hint">{t('settings.scheduled.resetStartDateDesc')}</div>
            ) : lastSyncedTo ? (
              <div className="getnote-input-hint">{t('settings.syncStartDate.lastSyncedToDesc')}</div>
            ) : (
              <div className="getnote-input-hint">{t('settings.syncStartDate.desc')}</div>
            )}
          </div>
          {settings.lastQuotaState?.exhausted && (
            <div className="getnote-quota-banner">
              <div className="getnote-quota-banner-title">
                {t(settings.lastQuotaState.reason === 'quota_month' ? 'settings.quotaMonthExhausted' : 'settings.quotaExhausted')}
              </div>
              <div className="getnote-quota-banner-detail">
                {t(settings.lastQuotaState.reason === 'quota_month' ? 'settings.quotaMonthRetry' : 'settings.quotaRetry')}
              </div>
            </div>
          )}
        </div>
      </SettingItem>

      <SettingItem name={t('settings.attachment.section')}>
        <div className="getnote-scheduled-options">
          <div className="getnote-scheduled-row getnote-attachment-master-row">
            <span className="getnote-scheduled-row-label">{t('settings.attachment.master')}</span>
            <span className="getnote-scheduled-row-control">
              <Toggle value={allAttachmentsOn} onChange={handleMasterAttachmentChange} />
              <button
                type="button"
                className="getnote-inline-disclosure"
                aria-expanded={attachmentDetailsOpen}
                onClick={() => setAttachmentDetailsOpen(prev => !prev)}
              >
                {attachmentDetailsOpen ? t('settings.collapse') : t('settings.expand')}
              </button>
            </span>
          </div>
          <div className={`getnote-scheduled-options-detail getnote-attachment-options${attachmentDetailsOpen ? '' : ' getnote-hidden'}`}>
            {attachmentKinds.map(kind => (
              <div className="getnote-scheduled-row getnote-nested-row getnote-attachment-option" key={kind}>
                <span className="getnote-scheduled-row-label">{t(`settings.attachment.${kind}`)}</span>
                <span className="getnote-scheduled-row-control">
                  <Toggle
                    value={allAttachmentsOn ? attachmentImport[kind] !== false : false}
                    disabled={!allAttachmentsOn}
                    onChange={(value) => handleChildAttachmentChange(kind, value)}
                  />
                </span>
              </div>
            ))}
          </div>
        </div>
      </SettingItem>

      <SettingItem name={t('settings.manualSync')}>
        <div className="getnote-manual-actions">
          <div className="getnote-manual-action-group">
            <div className="getnote-manual-action-title">{t('settings.manualSync.download')}</div>
            <div className="getnote-actions-row">
              <SyncButton
                hasCredentials={hasCredentials}
                isSyncing={isSyncing}
                onClick={startSync}
              />
              <button
                className="mod-secondary getnote-sync-action-button"
                disabled={!hasCredentials || isSyncing}
                onClick={openNotePicker}
              >
                {t('settings.syncPicker.button')}
              </button>
              {authMode === 'openapi' && (
                <button
                  className="mod-secondary getnote-sync-action-button"
                  disabled={!hasCredentials || isSyncing}
                  onClick={startSubscribedKnowledgeSync}
                >
                  {t('settings.subscribedKnowledge.button')}
                </button>
              )}
            </div>
          </div>
          <div className="getnote-manual-action-group">
            <div className="getnote-manual-action-title">{t('settings.manualSync.upload')}</div>
            <div className="getnote-actions-row">
              <button
                className="mod-secondary getnote-sync-action-button"
                disabled={!hasCredentials || isSyncing}
                onClick={openLocalUpload}
              >
                {t('settings.reverseSync.uploadButton')}
              </button>
            </div>
          </div>
        </div>
      </SettingItem>

      {/* 同步日志 */}
      <SettingItem name={t('syncHistory.title')}>
        <div className="getnote-sync-log-section">
          <div className="getnote-scheduled-row">
            <span className="getnote-scheduled-row-label">{t('settings.lastSync')}</span>
            <span className="getnote-scheduled-row-control getnote-muted-text">
              {formatLastSync(lastSyncTime)}
            </span>
          </div>
          <div className="getnote-scheduled-row">
            <span className="getnote-scheduled-row-label">{t('settings.syncStatus')}</span>
            <span className={`getnote-scheduled-row-control${isSyncing ? ' getnote-accent-text' : ' getnote-muted-text'}`}>
              {isSyncing ? t('syncHistory.status.syncing') : t('syncHistory.status.idle')}
            </span>
          </div>
          <button
            className="mod-secondary getnote-view-history-btn"
            onClick={() => openSyncHistoryModal(app, currentSyncHistory)}
          >
            {t('syncHistory.view')}
          </button>
        </div>
      </SettingItem>

      {/* 同步进度条 */}
      {isSyncing && (
        <div className="getnote-settings-sync-status" ref={syncStatusRef}>
          <div className="getnote-settings-sync-status-header">
            <span className="getnote-mono-text">{syncProgress?.message || t('sync.syncing')}</span>
            <button className="mod-warning getnote-settings-cancel-button" onClick={cancelSync}>
              {t('modal.cancel')}
            </button>
          </div>
          <div className="getnote-settings-progress-line">
            <span className="getnote-accent-text">{renderProgressBar(syncProgress?.percent ?? 0)}</span>
            <span className="getnote-settings-progress-percent">{syncProgress?.percent ?? 0}%</span>
          </div>
          {syncProgress?.count && (
            <div className="getnote-settings-progress-count">{syncProgress.count}</div>
          )}
        </div>
      )}

    </div>
  );
}
