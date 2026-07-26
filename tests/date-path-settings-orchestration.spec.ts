import { beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import GetNoteSyncPlugin from '../src/main';
import { migrateDatePaths } from '../src/date-path-migration';
import { SyncEngine } from '../src/sync';
import { DEFAULT_SETTINGS } from '../src/types';

vi.mock('../src/date-path-migration', () => ({
  migrateDatePaths: vi.fn(),
}));

function makePlugin(): GetNoteSyncPlugin {
  const plugin = new GetNoteSyncPlugin(new App());
  plugin.settings = {
    ...DEFAULT_SETTINGS,
    apiToken: 'token',
    clientId: 'client',
    syncHistory: [],
  };
  plugin.syncHistory = [];
  return plugin;
}

describe('date-path settings orchestration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('persists desired settings only after a completed local migration', async () => {
    const plugin = makePlugin();
    const save = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();
    vi.mocked(migrateDatePaths).mockResolvedValue({
      scanned: 2, moved: 1, unchanged: 0, skipped: 1, failed: 0,
      issues: [{ code: 'target-conflict', path: 'conflict.md', message: 'Target exists' }],
    });

    const result = await plugin.applyDatePathSettings({ enabled: true, format: 'YYYY/MM' });

    expect(migrateDatePaths).toHaveBeenCalledWith(plugin.app, '得到大脑', { enabled: true, format: 'YYYY/MM' });
    expect(plugin.settings.datePathEnabled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
    expect(result.skipped).toBe(1);
  });

  it('does not persist on a top-level failure and blocks concurrent sync or migration', async () => {
    const plugin = makePlugin();
    const save = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();
    let finish!: (value: Awaited<ReturnType<typeof migrateDatePaths>>) => void;
    vi.mocked(migrateDatePaths).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const sync = vi.spyOn(SyncEngine.prototype, 'sync');

    const first = plugin.applyDatePathSettings({ enabled: true, format: 'YYYY/MM/DD' });
    await expect(plugin.applyDatePathSettings({ enabled: false, format: 'YYYY/MM' })).rejects.toThrow('already running');
    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });
    expect(sync).not.toHaveBeenCalled();
    finish({ scanned: 0, moved: 0, unchanged: 0, skipped: 0, failed: 0, issues: [] });
    await first;
    expect(save).toHaveBeenCalledOnce();

    vi.mocked(migrateDatePaths).mockRejectedValue(new Error('vault unavailable'));
    await expect(plugin.applyDatePathSettings({ enabled: false, format: 'YYYY/MM' })).rejects.toThrow('vault unavailable');
    expect(plugin.settings.datePathEnabled).toBe(true);
    expect(save).toHaveBeenCalledOnce();
  });

  it('refuses migration while sync is active', async () => {
    const plugin = makePlugin();
    plugin.isSyncing = true;
    await expect(plugin.applyDatePathSettings({ enabled: false, format: 'YYYY/MM' })).rejects.toThrow('sync is running');
    expect(migrateDatePaths).not.toHaveBeenCalled();
  });
});
