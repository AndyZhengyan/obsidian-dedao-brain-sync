import { useState, useCallback, useRef, useEffect } from 'preact/hooks';
import { SettingItem } from './setting-item';
import { SyncButton } from './sync-button';
import { OAuthButton } from './oauth-button';
import type { Settings, SyncProgressDetail, SyncResult } from '../types';
import { App, AbstractInputSuggest } from 'obsidian';
import { fetchNotes } from '../api';
import { t } from '../i18n';

type SyncStatus = 'idle' | 'syncing' | 'done' | 'error';

interface SyncProgress {
  status: SyncStatus;
  result?: SyncResult;
  errorMsg?: string;
}

const GITHUB_URL = 'https://github.com/AndyZhengyan/obsidian-getnote-importer';

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
  }
}

interface SettingsComponentProps {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  updateCredentials: (apiToken: string, clientId: string) => void;
  startSync: () => void;
  isSyncing: boolean;
  openNotePicker: () => void;
  startAutoSync: () => void;
  stopAutoSync: () => void;
  cancelSync: () => void;
  app: App;
  syncProgress?: SyncProgressDetail;
}

export function SettingsComponent({
  settings,
  updateSetting,
  updateCredentials,
  startSync,
  isSyncing,
  openNotePicker,
  startAutoSync,
  stopAutoSync,
  cancelSync,
  app,
  syncProgress,
}: SettingsComponentProps) {
  const [apiToken, setApiToken] = useState(settings.apiToken);
  const [clientId, setClientId] = useState(settings.clientId);
  const [authMode, setAuthMode] = useState<'oauth' | 'manual'>(
    settings.apiToken && settings.clientId ? 'manual' : 'oauth'
  );
  const [folderName, setFolderName] = useState(settings.folderName);
  const [maxDays, setMaxDays] = useState(String(settings.maxDays));
  const [filenamePrefix, setFilenamePrefix] = useState(settings.filenamePrefix);
  const [scheduledEnabled, setScheduledEnabled] = useState(settings.scheduledSync.enabled);
  const [testingConnection, setTestingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [connectionErrorMsg, setConnectionErrorMsg] = useState('');

  const folderInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const inputEl = folderInputRef.current;
    if (!inputEl) return;

    const suggest = new FolderSuggest(app, inputEl, (value) => {
      setFolderName(value);
      updateSetting('folderName', value);
    });

    return () => suggest.close();
  }, [app]);

  const handleApiTokenChange = useCallback(
    (value: string) => {
      setApiToken(value);
      updateSetting('apiToken', value.trim());
    },
    [updateSetting]
  );

  const handleClientIdChange = useCallback(
    (value: string) => {
      setClientId(value);
      updateSetting('clientId', value.trim());
    },
    [updateSetting]
  );

  const handleFolderChange = useCallback(
    (value: string) => {
      const clean = value.replace(/[\\/:*?"<>|]/g, '').trim() || t('settings.folder.placeholder');
      setFolderName(clean);
      updateSetting('folderName', clean);
    },
    [updateSetting]
  );

  const handleMaxDaysChange = useCallback(
    (value: string) => {
      setMaxDays(value);
      const n = parseInt(value, 10);
      updateSetting('maxDays', isNaN(n) || n < 0 ? 0 : n);
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

  const handleScheduledEnabled = (checked: boolean) => {
    setScheduledEnabled(checked);
    updateSetting('scheduledSync', { ...settings.scheduledSync, enabled: checked });
    if (checked) {
      startAutoSync();
    } else {
      stopAutoSync();
    }
  };

  const handleScheduledInterval = (value: string) => {
    const n = parseInt(value, 10);
    updateSetting('scheduledSync', {
      ...settings.scheduledSync,
      intervalMinutes: isNaN(n) || n < 5 ? 5 : n,
    });
  };

  const handleScheduledOnStart = (checked: boolean) => {
    updateSetting('scheduledSync', { ...settings.scheduledSync, syncOnStart: checked });
  };

  const handleTestConnection = async () => {
    setTestingConnection(true);
    setConnectionStatus('idle');
    setConnectionErrorMsg('');
    try {
      await fetchNotes({ token: apiToken.trim(), clientId: clientId.trim(), sinceId: '0', limit: 1 });
      setConnectionStatus('success');
    } catch (err) {
      setConnectionStatus('error');
      setConnectionErrorMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingConnection(false);
    }
  };

  const hasCredentials = Boolean(apiToken.trim() && clientId.trim());
  const { scheduledSync } = settings;

  return (
    <div className="getnote-settings-react">
      <div className="getnote-settings-header">
        <h2>{t('settings.title')} <span style="font-size:12px;color:var(--text-muted)">by 关山的月儿</span></h2>
        <p className="getnote-settings-desc">
          {t('settings.desc')} <a href={GITHUB_URL} target="_blank" rel="noopener">{t('settings.community')}</a>
        </p>
      </div>

      {!hasCredentials && (
        <div className="getnote-onboarding">{t('settings.onboarding')}</div>
      )}

      {/* Client ID — first as per design */}
      <SettingItem
        name={t('settings.clientId.label')}
        description={t('settings.clientId.desc')}
      >
        <div className="getnote-auth-section">
          <div className="getnote-auth-toggle">
            <button
              className={authMode === 'oauth' ? 'mod-cta' : 'mod-secondary'}
              onClick={() => setAuthMode('oauth')}
            >
              {t('oauth.label')}
            </button>
            <button
              className={authMode === 'manual' ? 'mod-cta' : 'mod-secondary'}
              onClick={() => setAuthMode('manual')}
            >
              {t('settings.authManual')}
            </button>
          </div>

          {authMode === 'oauth' && (
            <OAuthButton
              onAuthorize={(token, cid) => {
                setApiToken(token);
                setClientId(cid);
                updateSetting('apiToken', token);
                updateSetting('clientId', cid);
              }}
              onSwitchToManual={() => setAuthMode('manual')}
            />
          )}

          {authMode === 'manual' && (
            <div className="getnote-manual-credentials">
              <input
                type="text"
                className="getnote-input"
                placeholder={t('settings.clientId.placeholder')}
                value={clientId}
                onInput={(e) => handleClientIdChange((e.target as HTMLInputElement).value)}
              />
              <input
                type="password"
                className="getnote-input"
                placeholder={t('settings.apiToken.placeholder')}
                value={apiToken}
                onInput={(e) => handleApiTokenChange((e.target as HTMLInputElement).value)}
              />
              {hasCredentials && (
                <div className="getnote-test-connection">
                  <button
                    className="mod-secondary"
                    disabled={testingConnection}
                    onClick={handleTestConnection}
                  >
                    {testingConnection ? t('settings.testingConnection') : t('settings.testConnection')}
                  </button>
                  {connectionStatus === 'success' && (
                    <span className="getnote-connection-success">{t('settings.connectionSuccess')}</span>
                  )}
                  {connectionStatus === 'error' && (
                    <span className="getnote-connection-error">
                      {t('settings.connectionError')}{connectionErrorMsg ? `: ${connectionErrorMsg}` : ''}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </SettingItem>

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
        <div className="getnote-input-hint">{t('settings.prefix.hint')}</div>
      </SettingItem>

      <SettingItem
        name={t('settings.maxDays.label')}
        description={t('settings.maxDays.desc')}
      >
        <input
          type="number"
          className="getnote-input"
          placeholder={t('settings.maxDays.placeholder')}
          value={maxDays}
          min="0"
          onInput={(e) => handleMaxDaysChange((e.target as HTMLInputElement).value)}
        />
        <div className="getnote-input-hint">{t('settings.maxDays.hint')}</div>
      </SettingItem>

      <SettingItem
        name={t('settings.scheduled.label')}
        description={t('settings.scheduled.desc')}
      >
        <div className="getnote-scheduled-row">
          <span>{t('settings.scheduled.enabled')}</span>
          <input
            type="checkbox"
            checked={scheduledEnabled}
            onChange={(e) => handleScheduledEnabled((e.target as HTMLInputElement).checked)}
          />
        </div>
        <div
          className="getnote-scheduled-rows"
          style={{ display: scheduledEnabled ? undefined : 'none' }}
        >
          <div className="getnote-scheduled-row">
            <span>{t('settings.scheduled.interval')}</span>
            <input
              type="number"
              min="5"
              value={scheduledSync.intervalMinutes}
              onInput={(e) => handleScheduledInterval((e.target as HTMLInputElement).value)}
            />
            <div className="getnote-input-hint">{t('settings.interval.hint')}</div>
          </div>
          <div className="getnote-scheduled-row">
            <span>{t('settings.scheduled.onStart')}</span>
            <input
              type="checkbox"
              checked={scheduledSync.syncOnStart}
              onChange={(e) => handleScheduledOnStart((e.target as HTMLInputElement).checked)}
            />
          </div>
        </div>
      </SettingItem>

      <div className="getnote-settings-divider" />

      <SettingItem name={t('settings.sync.label')} description={t('settings.sync.desc')}>
        <SyncButton
          hasCredentials={hasCredentials}
          isSyncing={isSyncing}
          onClick={startSync}
        />
      </SettingItem>

      {isSyncing && (
        <div className="getnote-sync-status">
          <div className="getnote-sync-status-row">
            <span>{syncProgress?.message || t('sync.syncing')}</span>
            <button className="mod-warning" onClick={cancelSync}>
              {t('modal.cancel')}
            </button>
          </div>
          <div className="getnote-progress-bar" style={{ height: '4px', margin: '6px 0', background: 'var(--background-modifier-border)', borderRadius: '2px', overflow: 'hidden' }}>
            <div className="getnote-progress-fill" style={{ width: `${syncProgress?.percent ?? 0}%`, height: '100%', background: 'var(--interactive-accent)', transition: 'width 0.3s ease' }} />
          </div>
          {syncProgress?.count && (
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{syncProgress.count}</div>
          )}
        </div>
      )}

      <SettingItem name={t('settings.syncPicker.label')} description={t('settings.syncPicker.desc')}>
        <button className="mod-secondary" onClick={openNotePicker}>
          {t('settings.syncPicker.button')}
        </button>
      </SettingItem>
    </div>
  );
}
