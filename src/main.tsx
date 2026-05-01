import { App, Modal, Plugin, getLanguage } from 'obsidian';
import ReactDOM from 'react-dom';
import { DEFAULT_SETTINGS, type Settings, type SyncProgressDetail, type SyncHistoryEntry, type SyncResult } from './types';
import { GetNoteSettingsTab } from './settings-tab';
import { SyncEngine, SyncCancelledError } from './sync';
import { showError, showSuccess, showNotice } from './ui/notice';
import { NotePickerModal } from './ui/note-picker-modal';
import { initI18n, t } from './i18n';

export default class GetNoteSyncPlugin extends Plugin {
  settings!: Settings;
  isSyncing = false;
  syncProgress: SyncProgressDetail = { message: '', count: '', percent: 0 };
  syncHistory: SyncHistoryEntry[] = [];
  lastSyncResult: SyncHistoryEntry | null = null;
  private currentSyncEngine: SyncEngine | null = null;
  private autoSyncIntervalId: number | undefined;
  private settingsTab?: GetNoteSettingsTab;
  private lastProgressUpdate = 0;
  private autoSyncFailCount = 0;

  async onload(): Promise<void> {
    initI18n(getLanguage());

    const loaded = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };

    this.settingsTab = new GetNoteSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    this.addCommand({
      id: 'sync-notes',
      name: t('command.sync'),
      callback: () => this.startSync(),
    });

    this.addRibbonIcon('book-lock', t('ribbon.tooltip'), () => this.startSync());

    if (this.settings.scheduledSync.enabled) {
      if (this.settings.scheduledSync.syncOnStart) {
        this.startSync();
      }
      this.startAutoSync();
    }

    console.log(t('console.loaded'));
  }

  onunload(): void {
    this.stopAutoSync();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  getVaultFolders(): string[] {
    const folders = new Set<string>();
    for (const dir of this.app.vault.getAllFolders()) {
      const parts = dir.path.split('/');
      if (parts.length >= 1 && parts[0]) {
        folders.add(parts[0]);
      }
    }
    folders.delete(this.settings.folderName);
    return Array.from(folders).sort();
  }

  private refreshSettingsTab(): void {
    if (this.settingsTab) this.settingsTab.display();
  }

  startAutoSync(): void {
    this.stopAutoSync();
    const interval = Math.max(5, this.settings.scheduledSync.intervalMinutes) * 60 * 1000;
    this.autoSyncIntervalId = window.setInterval(() => {
      if (!this.isSyncing) {
        void this.doAutoSync();
      }
    }, interval);
  }

  stopAutoSync(): void {
    if (this.autoSyncIntervalId !== undefined) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = undefined;
    }
  }

  cancelSync(): void {
    this.currentSyncEngine?.cancel();
  }

  private recordSyncHistory(result: SyncResult, type: 'full' | 'selective' | 'auto'): void {
    const entry: SyncHistoryEntry = { timestamp: Date.now(), result, type };
    this.syncHistory.push(entry);
    this.syncHistory = this.syncHistory.slice(-20);
    this.lastSyncResult = entry;
  }

  private async doAutoSync(): Promise<void> {
    try {
      const engine = new SyncEngine(this.app, this.settings);
      const result = await engine.sync();
      this.recordSyncHistory(result, 'auto');
      this.autoSyncFailCount = 0;
      if (result.created > 0 || result.updated > 0) {
        showNotice(t('notice.autoSynced', { created: result.created, updated: result.updated }));
      }
    } catch {
      this.autoSyncFailCount++;
      const msg = this.autoSyncFailCount >= 3
        ? t('sync.autoFailRepeated', { count: this.autoSyncFailCount })
        : t('notice.autoSyncFailed');
      showNotice(msg, 15000);
    }
  }

  private setProgress(info: { page?: number; processed?: number; total?: number; created?: number; updated?: number; skipped?: number; failed?: number; percent?: number }) {
    this.syncProgress = {
      message: info.page ? t('sync.fetching', { page: info.page }) : t('sync.syncing'),
      count: info.processed && info.total
        ? t('sync.processingCount', { current: info.processed, total: info.total })
        : '',
      percent: info.percent ?? 0,
    };
    const now = Date.now();
    if (now - this.lastProgressUpdate > 300) {
      this.lastProgressUpdate = now;
      this.refreshSettingsTab();
    }
  }

  async startSync(): Promise<void> {
    if (this.isSyncing) return;

    if (!this.settings.apiToken || !this.settings.clientId) {
      showError(t('notice.fillCredentials'));
      return;
    }

    this.isSyncing = true;
    this.syncProgress = { message: t('sync.fetching', { page: 1 }), count: '', percent: 0 };
    this.currentSyncEngine = null;
    this.refreshSettingsTab();
    showNotice(t('sync.started'));

    const engine = new SyncEngine(this.app, this.settings, (info) => this.setProgress(info));
    this.currentSyncEngine = engine;

    try {
      const result = await engine.sync();
      this.recordSyncHistory(result, 'full');
      this.syncProgress = {
        message: t('modal.done'),
        count: `${t('modal.created', { created: result.created })} · ${t('modal.updated', { updated: result.updated })} · ${t('modal.skipped', { skipped: result.skipped })}${result.failed > 0 ? ` · ${t('modal.failed', { failed: result.failed })}` : ''}`,
        percent: 100,
      };
      this.refreshSettingsTab();
      showNotice(t('notice.syncComplete', { created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed > 0 ? ` · ${t('modal.failed', { failed: result.failed })}` : '' }), 8000);
      setTimeout(() => {
        this.syncProgress = { message: '', count: '', percent: 0 };
        this.isSyncing = false;
        this.refreshSettingsTab();
      }, 8000);
    } catch (err) {
      if (err instanceof SyncCancelledError) {
        this.syncProgress = { message: t('modal.cancelled'), count: '', percent: 0 };
      } else {
        const msg = err instanceof Error ? err.message : String(err);
        this.syncProgress = { message: t('notice.syncFailed', { msg }), count: '', percent: 0 };
        console.error(t('console.syncError'), err);
      }
      this.isSyncing = false;
      this.currentSyncEngine = null;
      this.refreshSettingsTab();
    }
  }

  openNotePicker(): void {
    if (this.isSyncing) return;
    const wrapper = new NotePickerModalWrapper(this.app, this);
    wrapper.open();
  }

  async syncSelectedNotes(noteIds: string[]): Promise<void> {
    if (this.isSyncing) return;
    this.isSyncing = true;
    this.syncProgress = { message: t('sync.syncing'), count: '', percent: 0 };
    this.currentSyncEngine = null;
    this.refreshSettingsTab();
    showNotice(t('sync.started'));

    const engine = new SyncEngine(this.app, this.settings, (info) => this.setProgress(info));
    this.currentSyncEngine = engine;

    try {
      const result = await engine.syncNoteIds(noteIds);
      this.recordSyncHistory(result, 'selective');
      this.syncProgress = {
        message: t('modal.done'),
        count: `${t('modal.created', { created: result.created })} · ${t('modal.updated', { updated: result.updated })} · ${t('modal.skipped', { skipped: result.skipped })}`,
        percent: 100,
      };
      this.refreshSettingsTab();
      showNotice(t('notice.syncComplete', { created: result.created, updated: result.updated, skipped: result.skipped, failed: '' }), 8000);
      setTimeout(() => {
        this.syncProgress = { message: '', count: '', percent: 0 };
        this.isSyncing = false;
        this.refreshSettingsTab();
      }, 8000);
    } catch (err) {
      if (err instanceof SyncCancelledError) {
        this.syncProgress = { message: t('modal.cancelled'), count: '', percent: 0 };
      } else {
        this.syncProgress = { message: t('notice.syncFailed', { msg: err instanceof Error ? err.message : String(err) }), count: '', percent: 0 };
      }
      this.isSyncing = false;
      this.currentSyncEngine = null;
      this.refreshSettingsTab();
    }
  }
}

class NotePickerModalWrapper extends Modal {
  private abortController = new AbortController();

  constructor(app: App, private plugin: GetNoteSyncPlugin) {
    super(app);
    this.titleEl.setText(t('picker.title'));
  }

  onOpen() {
    ReactDOM.render(
      <NotePickerModal
        token={this.plugin.settings.apiToken}
        clientId={this.plugin.settings.clientId}
        abortSignal={this.abortController.signal}
        onConfirm={async (noteIds) => {
          this.abortController.abort();
          this.close();
          await this.plugin.syncSelectedNotes(noteIds);
        }}
        onCancel={() => {
          this.abortController.abort();
          this.close();
        }}
      />,
      this.contentEl
    );
  }

  onClose() {
    this.abortController.abort();
    ReactDOM.unmountComponentAtNode(this.contentEl);
  }
}
