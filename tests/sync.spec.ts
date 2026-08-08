import { describe, it, expect, vi, afterEach } from 'vitest';
import { App, Modal, TFile } from 'obsidian';
import GetNoteSyncPlugin from '../src/main';
import { ReverseSyncEngine } from '../src/reverse-sync';
import { GetNoteSettingsTab } from '../src/settings-tab';
import { SyncCancelledError, SyncEngine } from '../src/sync';
import { DEFAULT_SETTINGS } from '../src/types';

describe('SyncCancelledError', () => {
  it('has name SyncCancelledError', () => {
    expect(new SyncCancelledError().name).toBe('SyncCancelledError');
  });

  it('has message "Sync cancelled"', () => {
    expect(new SyncCancelledError().message).toBe('Sync cancelled');
  });

  it('is an instance of Error', () => {
    expect(new SyncCancelledError()).toBeInstanceOf(Error);
  });

  it('is caught by instanceof check', () => {
    try {
      throw new SyncCancelledError();
    } catch (err) {
      expect(err instanceof SyncCancelledError).toBe(true);
    }
  });
});

describe('GetNoteSyncPlugin runSync cleanup', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  function makePlugin() {
    const plugin = new GetNoteSyncPlugin(new App());
    plugin.settings = {
      ...DEFAULT_SETTINGS,
      apiToken: 'test-token',
      clientId: 'test-client',
      syncHistory: [],
    };
    plugin.syncHistory = [];
    return plugin;
  }

  function watchSettingsRuntimeUpdate(plugin: GetNoteSyncPlugin) {
    const settingsTab = new GetNoteSettingsTab(plugin.app, plugin);
    const updateRuntimeState = vi.spyOn(settingsTab, 'updateRuntimeState').mockImplementation(() => {});
    plugin['settingsTab'] = settingsTab;
    return updateRuntimeState;
  }

  it('refreshes settings after clearing stale quota state', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-23T01:00:00+08:00'));
    const plugin = makePlugin();
    plugin.settings.lastQuotaState = {
      exhausted: true,
      reason: 'quota_day',
      checkedAt: new Date('2026-07-21T23:00:00+08:00').getTime(),
    };
    const updateRuntimeState = watchSettingsRuntimeUpdate(plugin);

    await plugin['clearStaleQuotaState']();

    expect(updateRuntimeState).toHaveBeenCalledTimes(1);
  });

  it('refreshes settings when manual sync starts', async () => {
    let resolveSync!: (result: Awaited<ReturnType<SyncEngine['sync']>>) => void;
    vi.spyOn(SyncEngine.prototype, 'sync').mockImplementation(() => new Promise(resolve => {
      resolveSync = resolve;
    }));
    const plugin = makePlugin();
    const updateRuntimeState = watchSettingsRuntimeUpdate(plugin);

    const syncPromise = plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });
    expect(updateRuntimeState).toHaveBeenCalledTimes(1);

    resolveSync({ created: 0, updated: 0, skipped: 0, failed: 0, total: 0, items: [] });
    await syncPromise;
  });

  it('refreshes settings when manual sync is cancelled', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockRejectedValue(new SyncCancelledError());
    const plugin = makePlugin();
    const updateRuntimeState = watchSettingsRuntimeUpdate(plugin);

    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });

    expect(updateRuntimeState).toHaveBeenCalledTimes(2);
  });

  it('refreshes settings when manual sync completes', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 1,
      items: [],
    });
    const plugin = makePlugin();
    const updateRuntimeState = watchSettingsRuntimeUpdate(plugin);

    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });

    expect(updateRuntimeState).toHaveBeenCalledTimes(2);
  });

  it('manual sync failure clears syncing state', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });

    expect(plugin.isSyncing).toBe(false);
    expect(plugin.syncProgress.message).toContain('boom');
  });

  it('manual sync cancellation clears syncing state', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockRejectedValue(new SyncCancelledError());
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });

    expect(plugin.isSyncing).toBe(false);
    expect(plugin.syncProgress.message).toContain('已取消');
  });

  it('manual sync success clears syncing state immediately', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 1,
      items: [],
    });
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });

    expect(plugin.isSyncing).toBe(false);
    expect(plugin.currentSyncEngine).toBe(null);
    expect(plugin.syncProgress).toEqual({ message: '', count: '', percent: 0 });
  });

  it('records knowledge-base sync mode and selected count', async () => {
    vi.spyOn(SyncEngine.prototype, 'syncSubscribedKnowledge').mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 1,
      items: [],
    });
    const plugin = makePlugin();

    await plugin['runSubscribedKnowledgeSync']({
      selectedNoteIds: ['blogger_old_post'],
      topicIds: ['topic_1'],
      bloggerIds: ['blogger_1'],
    });

    expect(plugin.syncHistory.at(-1)).toMatchObject({
      type: 'full',
      mode: 'knowledge-base',
      scope: {
        selectedCount: 1,
        selectedIds: ['blogger_old_post'],
      },
    });
  });

  it('records only start date when scope contains both date and maxDays', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 0,
      items: [],
    });
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 30, syncStartDate: '2026-05-09' });

    expect(plugin.syncHistory.at(-1)?.scope).toEqual({
      maxDays: 0,
      syncStartDate: '2026-05-09',
      selectedCount: undefined,
      selectedIds: undefined,
    });
  });

  it('manual sync records the note type filter from its own scope', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 0,
      items: [],
    });
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '', enabledNoteTypes: ['link'] });

    expect(plugin.syncHistory.at(-1)?.scope).toEqual({
      maxDays: 0,
      syncStartDate: '',
      enabledNoteTypes: ['link'],
      selectedCount: undefined,
      selectedIds: undefined,
    });
  });

  it('manual sync days scope passes maxDays through engine', async () => {
    const syncScopeOptions: unknown[] = [];
    vi.spyOn(SyncEngine.prototype, 'sync').mockImplementation(function (this: SyncEngine) {
      syncScopeOptions.push(this['scopeOptions']);
      return Promise.resolve({ created: 0, updated: 0, skipped: 0, failed: 0, total: 0, items: [] });
    });
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 7, syncStartDate: '' });

    expect(syncScopeOptions).toEqual([
      {
        maxDays: 7,
        syncStartDate: '',
      },
    ]);
  });

  it('manual sync date scope disables maxDays in engine', async () => {
    const syncScopeOptions: unknown[] = [];
    vi.spyOn(SyncEngine.prototype, 'sync').mockImplementation(function (this: SyncEngine) {
      syncScopeOptions.push(this['scopeOptions']);
      return Promise.resolve({ created: 0, updated: 0, skipped: 0, failed: 0, total: 0, items: [] });
    });
    const plugin = makePlugin();

    await plugin['runSync']('full', { maxDays: 7, syncStartDate: '2026-05-09' });

    expect(syncScopeOptions).toEqual([
      {
        maxDays: 0,
        syncStartDate: '2026-05-09',
      },
    ]);
  });

  it('registers scheduled sync interval with Obsidian lifecycle', () => {
    vi.useFakeTimers();
    const plugin = makePlugin();
    plugin.settings.scheduledSync = {
      enabled: true,
      intervalMinutes: 5,
      syncOnStart: true,
    };
    const registerInterval = vi.fn();
    Object.assign(plugin, { registerInterval });

    plugin.startAutoSync();

    expect(registerInterval).toHaveBeenCalledTimes(1);
    expect(registerInterval).toHaveBeenCalledWith(expect.anything());
  });

  it('opens search in a modal instead of a workspace sidebar view', async () => {
    const plugin = makePlugin();
    const openModal = vi.spyOn(Modal.prototype, 'open').mockImplementation(() => {});
    const getLeavesOfType = vi.spyOn(plugin.app.workspace, 'getLeavesOfType');
    const getRightLeaf = vi.spyOn(plugin.app.workspace, 'getRightLeaf');
    const revealLeaf = vi.spyOn(plugin.app.workspace, 'revealLeaf');

    await plugin.openSearchView('选中文本');

    expect(openModal).toHaveBeenCalledTimes(1);
    expect(getLeavesOfType).not.toHaveBeenCalled();
    expect(getRightLeaf).not.toHaveBeenCalled();
    expect(revealLeaf).not.toHaveBeenCalled();
  });

  it('disables maxDays when scheduled sync resumes from last synced timestamp', async () => {
    const syncScopeOptions: unknown[] = [];
    vi.spyOn(SyncEngine.prototype, 'sync').mockImplementation(function (this: SyncEngine) {
      syncScopeOptions.push(this['scopeOptions']);
      return Promise.resolve({ created: 0, updated: 0, skipped: 0, failed: 0, total: 0 });
    });
    const plugin = makePlugin();
    plugin.settings.maxDays = 30;
    plugin.settings.lastSyncEndTimestamp = '2026-05-09T10:00:00+08:00';
    plugin.settings.scheduledSync.enabledNoteTypes = ['link'];

    plugin['doAutoSync']();

    await vi.waitFor(() => {
      expect(syncScopeOptions).toEqual([
        {
          maxDays: 0,
          syncStartDate: '2026-05-09T10:00:00+08:00',
          enabledNoteTypes: ['link'],
        },
      ]);
    });
  });

  it('disables maxDays when scheduled sync uses configured start date', async () => {
    const syncScopeOptions: unknown[] = [];
    vi.spyOn(SyncEngine.prototype, 'sync').mockImplementation(function (this: SyncEngine) {
      syncScopeOptions.push(this['scopeOptions']);
      return Promise.resolve({ created: 0, updated: 0, skipped: 0, failed: 0, total: 0 });
    });
    const plugin = makePlugin();
    plugin.settings.maxDays = 30;
    plugin.settings.syncStartDate = '2026-05-09';
    plugin.settings.lastSyncEndTimestamp = '';
    plugin.settings.scheduledSync.enabledNoteTypes = ['link'];

    plugin['doAutoSync']();

    await vi.waitFor(() => {
      expect(syncScopeOptions).toEqual([
        {
          maxDays: 0,
          syncStartDate: '2026-05-09',
          enabledNoteTypes: ['link'],
        },
      ]);
      expect(plugin.syncHistory.at(-1)?.scope).toEqual({
        maxDays: 0,
        syncStartDate: '2026-05-09',
        enabledNoteTypes: ['link'],
        selectedCount: undefined,
        selectedIds: undefined,
      });
    });
  });

  it('advances checkpoint when any note succeeds even if other notes fail', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 1,
      total: 2,
      items: [],
      lastNoteTimestamp: '2026-05-10T12:00:00+08:00',
    });
    const plugin = makePlugin();
    plugin.settings.lastSyncEndTimestamp = '2026-05-09T10:00:00+08:00';

    await plugin['runSync']('auto', {
      maxDays: 0,
      syncStartDate: plugin.settings.lastSyncEndTimestamp,
    });

    // checkpoint advances because created > 0, even though failed = 1
    expect(plugin.settings.lastSyncEndTimestamp).toBe('2026-05-10T12:00:00+08:00');
  });

  it('keeps the existing auto-sync checkpoint when a retryable knowledge note failed', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0,
      failed: 1,
      total: 2,
      items: [],
      lastNoteTimestamp: '2026-05-10T12:00:00+08:00',
      checkpointBlocked: true,
    });
    const plugin = makePlugin();
    plugin.settings.lastSyncEndTimestamp = '2026-05-09T10:00:00+08:00';

    await plugin['runSync']('auto', {
      maxDays: 0,
      syncStartDate: plugin.settings.lastSyncEndTimestamp,
    });

    expect(plugin.settings.lastSyncEndTimestamp).toBe('2026-05-09T10:00:00+08:00');
  });

  it('selected sync records the note type filter from the picker scope', async () => {
    vi.spyOn(SyncEngine.prototype, 'syncNoteIds').mockResolvedValue({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 0,
      items: [],
    });
    const plugin = makePlugin();

    await plugin['runSync']('selective', { maxDays: 0, syncStartDate: '', enabledNoteTypes: ['link'] }, ['note-1']);

    expect(plugin.syncHistory.at(-1)?.scope).toEqual({
      maxDays: 0,
      syncStartDate: '',
      enabledNoteTypes: ['link'],
      selectedCount: 1,
      selectedIds: ['note-1'],
    });
  });

  it('scheduled sync does not run reverse upload', async () => {
    vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
      total: 0,
    });
    const reverseSyncBack = vi.spyOn(ReverseSyncEngine.prototype, 'syncBack').mockResolvedValue({
      created: 1,
      skipped: 0,
      failed: 0,
      total: 1,
      items: [],
    });
    const plugin = makePlugin();

    plugin['doAutoSync']();

    await vi.waitFor(() => {
      expect(SyncEngine.prototype.sync).toHaveBeenCalled();
    });
    expect(reverseSyncBack).not.toHaveBeenCalled();
  });

  it('runs reverse sync without requiring an upload permission switch', async () => {
    const syncBack = vi.spyOn(ReverseSyncEngine.prototype, 'syncBack').mockResolvedValue({
      created: 1,
      skipped: 0,
      failed: 0,
      total: 1,
      items: [],
    });
    const plugin = makePlugin();
    plugin.settings.reverseSync = { enabled: false };

    await plugin['reverseSyncToGetNote']();

    expect(syncBack).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => {
      expect(plugin.isSyncing).toBe(false);
    });
  });

  it('uploads selected local files without scanning the whole sync folder and records upload history', async () => {
    const syncBack = vi.spyOn(ReverseSyncEngine.prototype, 'syncBack').mockResolvedValue({
      created: 99,
      skipped: 0,
      failed: 0,
      total: 99,
      items: [],
    });
    const syncFiles = vi.spyOn(ReverseSyncEngine.prototype, 'syncFiles').mockResolvedValue({
      created: 1,
      skipped: 0,
      failed: 0,
      total: 1,
      items: [{
        noteId: 'remote-created',
        title: 'Upload me',
        noteType: 'plain_text',
        updatedAt: '2026-05-27T12:00:00.000Z',
        status: 'created',
      }],
    });
    const plugin = makePlugin();
    plugin.settings.reverseSync = { enabled: false };
    const selectedFiles = [new TFile('Inbox/upload-me.md')];

    plugin.uploadSelectedLocalNotes(selectedFiles);

    await vi.waitFor(() => {
      expect(syncFiles).toHaveBeenCalledWith(selectedFiles);
    });
    expect(syncBack).not.toHaveBeenCalled();
    await vi.waitFor(() => {
      expect(plugin.syncHistory.at(-1)).toEqual(expect.objectContaining({
        type: 'upload',
        mode: 'local-upload',
        status: 'success',
        result: expect.objectContaining({
          created: 1,
          skipped: 0,
          failed: 0,
          total: 1,
          items: [
            expect.objectContaining({
              noteId: 'remote-created',
              title: 'Upload me',
              status: 'created',
            }),
          ],
        }),
      }));
      expect(plugin.isSyncing).toBe(false);
    });
  });

  it('records failed upload history when selected local upload fails', async () => {
    vi.spyOn(ReverseSyncEngine.prototype, 'syncFiles').mockResolvedValue({
      created: 0,
      skipped: 0,
      failed: 1,
      total: 1,
      items: [{
        noteId: 'Inbox/fail.md',
        title: 'fail',
        noteType: 'plain_text',
        updatedAt: '2026-05-27T12:00:00.000Z',
        status: 'failed',
        error: 'API 服务器错误 500',
      }],
    });
    const plugin = makePlugin();

    plugin.uploadSelectedLocalNotes([new TFile('Inbox/fail.md')]);

    await vi.waitFor(() => {
      expect(plugin.syncHistory.at(-1)).toEqual(expect.objectContaining({
        type: 'upload',
        mode: 'local-upload',
        status: 'failed',
        error: '失败 1 篇',
        result: expect.objectContaining({
          items: [
            expect.objectContaining({
              noteId: 'Inbox/fail.md',
              status: 'failed',
              error: 'API 服务器错误 500',
            }),
          ],
        }),
      }));
    });
    expect(plugin.isSyncing).toBe(false);
  });
});

describe('GetNoteSyncPlugin ribbon actions', () => {
  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('registers separate sync and search ribbon actions', async () => {
    vi.useFakeTimers();
    const plugin = new GetNoteSyncPlugin(new App());
    Object.assign(plugin.app.vault.adapter, {
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn(),
      copy: vi.fn(),
    });
    const addRibbonIcon = vi.fn();
    const openManualSyncModal = vi.spyOn(plugin, 'openManualSyncModal').mockImplementation(() => {});
    const openSearchView = vi.spyOn(plugin, 'openSearchView').mockImplementation(() => {});
    Object.assign(plugin, { addRibbonIcon });

    await plugin.onload();

    const syncRibbon = addRibbonIcon.mock.calls.find(([icon]) => icon === 'book-lock');
    const searchRibbon = addRibbonIcon.mock.calls.find(([icon]) => icon === 'brain-circuit');

    expect(syncRibbon).toBeDefined();
    expect(searchRibbon).toBeDefined();

    syncRibbon![2]();
    searchRibbon![2]();

    expect(openManualSyncModal).toHaveBeenCalledOnce();
    expect(openSearchView).toHaveBeenCalledOnce();
  });

  it('registers both ribbons once and hides a disabled sync ribbon', async () => {
    vi.useFakeTimers();
    const plugin = new GetNoteSyncPlugin(new App());
    Object.assign(plugin.app.vault.adapter, {
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn(),
      copy: vi.fn(),
    });
    vi.spyOn(plugin, 'loadData').mockResolvedValue({
      ribbonActions: { sync: false, search: true },
    });
    const addRibbonIcon = vi.fn((_icon: string, title: string) => {
      const el = document.createElement('div');
      el.setAttribute('aria-label', title);
      plugin.app.workspace.containerEl.appendChild(el);
      return el;
    });
    Object.assign(plugin, { addRibbonIcon });

    await plugin.onload();

    expect(addRibbonIcon.mock.calls.some(([icon]) => icon === 'book-lock')).toBe(true);
    expect(addRibbonIcon.mock.calls.some(([icon]) => icon === 'brain-circuit')).toBe(true);
    expect(plugin.app.workspace.containerEl.querySelector('[aria-label="同步得到大脑"]')?.classList.contains('getnote-ribbon-action-hidden')).toBe(true);
  });

  it('hides an existing sync ribbon when its setting changes', async () => {
    vi.useFakeTimers();
    const plugin = new GetNoteSyncPlugin(new App());
    Object.assign(plugin.app.vault.adapter, {
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn(),
      copy: vi.fn(),
    });
    const addRibbonIcon = vi.fn((_icon: string, title: string) => {
      const el = document.createElement('div');
      el.setAttribute('aria-label', title);
      plugin.app.workspace.containerEl.appendChild(el);
      return el;
    });
    Object.assign(plugin, { addRibbonIcon });

    await plugin.onload();
    const syncRibbon = plugin.app.workspace.containerEl.querySelector<HTMLElement>('[aria-label="同步得到大脑"]')!;
    addRibbonIcon.mockClear();

    plugin['settingsTab']!.updateSetting('ribbonActions', { sync: false, search: true });

    expect(syncRibbon.classList.contains('getnote-ribbon-action-hidden')).toBe(true);
    expect(addRibbonIcon).not.toHaveBeenCalled();
  });

  it('hides the existing search ribbon instead of rebuilding ribbon actions', async () => {
    vi.useFakeTimers();
    const plugin = new GetNoteSyncPlugin(new App());
    Object.assign(plugin.app.vault.adapter, {
      exists: vi.fn().mockResolvedValue(false),
      mkdir: vi.fn(),
      copy: vi.fn(),
    });
    const addRibbonIcon = vi.fn((_icon: string, title: string) => {
      const el = document.createElement('div');
      el.setAttribute('aria-label', title);
      plugin.app.workspace.containerEl.appendChild(el);
      return el;
    });
    Object.assign(plugin, { addRibbonIcon });

    await plugin.onload();
    const searchRibbon = plugin.app.workspace.containerEl.querySelector<HTMLElement>('[aria-label="搜索得到大脑"]')!;
    addRibbonIcon.mockClear();

    plugin['settingsTab']!.updateSetting('ribbonActions', { sync: true, search: false });

    expect(searchRibbon.classList.contains('getnote-ribbon-action-hidden')).toBe(true);
    expect(addRibbonIcon).not.toHaveBeenCalled();

    plugin['settingsTab']!.updateSetting('ribbonActions', { sync: true, search: true });

    expect(searchRibbon.classList.contains('getnote-ribbon-action-hidden')).toBe(false);
    expect(addRibbonIcon).not.toHaveBeenCalled();
  });
});
