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

  it('persists desired settings and category origins before executing file moves', async () => {
    const plugin = makePlugin();
    const order: string[] = [];
    const save = vi.spyOn(plugin, 'saveSettings').mockImplementation(async () => {
      order.push('save');
    });
    vi.mocked(migrateDatePaths).mockImplementationOnce(async (_app, _root, _target, context) => {
      order.push('plan');
      await context.beforeExecute({
        'uid-1': { path: '得到大脑/项目/笔记.md', category: '项目' },
      });
      order.push('execute');
      return {
        scanned: 2, moved: 1, unchanged: 0, skipped: 1, failed: 0,
        issues: [{ code: 'target-conflict', path: 'conflict.md', message: 'Target exists' }],
      };
    });

    const result = await plugin.applyDatePathSettings({ enabled: true, format: 'YYYY/MM' });

    expect(migrateDatePaths).toHaveBeenCalledWith(
      plugin.app,
      '得到大脑',
      { enabled: true, format: 'YYYY/MM' },
      expect.objectContaining({
        source: { enabled: false, format: 'YYYY/MM' },
        categoryOrigins: {},
        beforeExecute: expect.any(Function),
      }),
    );
    expect(plugin.settings.datePathEnabled).toBe(true);
    expect(plugin.settings.datePathCategoryOrigins).toEqual({
      'uid-1': { path: '得到大脑/项目/笔记.md', category: '项目' },
    });
    expect(save).toHaveBeenCalledOnce();
    expect(order).toEqual(['plan', 'save', 'execute']);
    expect(result.skipped).toBe(1);
  });

  it('restores in-memory settings and executes no file moves when the initial save fails', async () => {
    const plugin = makePlugin();
    vi.spyOn(plugin, 'saveSettings').mockRejectedValue(new Error('disk full'));
    vi.mocked(migrateDatePaths).mockImplementationOnce(async (_app, _root, _target, context) => {
      await context.beforeExecute({
        'uid-1': { path: '得到大脑/项目/笔记.md', category: '项目' },
      });
      throw new Error('unreachable');
    });

    await expect(plugin.applyDatePathSettings({
      enabled: true,
      format: 'YYYY/MM/DD',
    })).rejects.toThrow('disk full');

    expect(plugin.settings.datePathEnabled).toBe(false);
    expect(plugin.settings.datePathFormat).toBe('YYYY/MM');
    expect(plugin.settings.datePathCategoryOrigins).toEqual({});
    expect(migrateDatePaths).toHaveBeenCalledOnce();
  });

  it('keeps the persisted target when migration throws so reconcile can resume', async () => {
    const plugin = makePlugin();
    const save = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();
    vi.mocked(migrateDatePaths).mockImplementationOnce(async (_app, _root, _target, context) => {
      await context.beforeExecute({
        'uid-1': { path: '得到大脑/项目/笔记.md', category: '项目' },
      });
      throw new Error('vault unavailable');
    });

    await expect(plugin.applyDatePathSettings({
      enabled: true,
      format: 'YYYY/MM/DD',
    })).rejects.toThrow('vault unavailable');

    expect(plugin.settings.datePathEnabled).toBe(true);
    expect(plugin.settings.datePathFormat).toBe('YYYY/MM/DD');
    expect(plugin.settings.datePathCategoryOrigins).toEqual({
      'uid-1': { path: '得到大脑/项目/笔记.md', category: '项目' },
    });
    expect(save).toHaveBeenCalledOnce();
  });

  it('blocks concurrent sync or migration', async () => {
    const plugin = makePlugin();
    const save = vi.spyOn(plugin, 'saveSettings').mockResolvedValue();
    let finish!: (value: Awaited<ReturnType<typeof migrateDatePaths>>) => void;
    vi.mocked(migrateDatePaths).mockImplementation(async (_app, _root, _target, context) => {
      await context.beforeExecute({});
      return new Promise(resolve => { finish = resolve; });
    });
    const sync = vi.spyOn(SyncEngine.prototype, 'sync');

    const first = plugin.applyDatePathSettings({ enabled: true, format: 'YYYY/MM/DD' });
    await expect(plugin.applyDatePathSettings({ enabled: false, format: 'YYYY/MM' })).rejects.toThrow('already running');
    await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });
    expect(sync).not.toHaveBeenCalled();
    finish({ scanned: 0, moved: 0, unchanged: 0, skipped: 0, failed: 0, issues: [] });
    await first;
    expect(save).toHaveBeenCalledOnce();
  });

  it('refuses migration while sync is active', async () => {
    const plugin = makePlugin();
    plugin.isSyncing = true;
    await expect(plugin.applyDatePathSettings({ enabled: false, format: 'YYYY/MM' })).rejects.toThrow('sync is running');
    expect(migrateDatePaths).not.toHaveBeenCalled();
  });
});
