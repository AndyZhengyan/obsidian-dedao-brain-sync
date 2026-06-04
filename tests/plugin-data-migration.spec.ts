import { beforeEach, describe, expect, it, vi } from 'vitest';
import { issuedNotices, resetIssuedNotices } from 'obsidian';
import { migrateLegacyPluginData, notifyLegacyPluginDataMigrated } from '../src/main';

function makeAdapter(existingPaths: string[]) {
  const existing = new Set(existingPaths);
  return {
    exists: vi.fn(async (path: string) => existing.has(path)),
    mkdir: vi.fn(async (path: string) => {
      existing.add(path);
    }),
    copy: vi.fn(async (_from: string, to: string) => {
      existing.add(to);
    }),
  };
}

describe('migrateLegacyPluginData', () => {
  beforeEach(() => {
    resetIssuedNotices();
  });

  it('copies legacy data.json when the current plugin has no data yet', async () => {
    const adapter = makeAdapter([
      '.obsidian/plugins/obsidian-getnote-importer/data.json',
    ]);

    const migrated = await migrateLegacyPluginData(adapter, 'dedao-brain-sync');

    expect(migrated).toBe(true);
    expect(adapter.mkdir).toHaveBeenCalledWith('.obsidian/plugins/dedao-brain-sync');
    expect(adapter.copy).toHaveBeenCalledWith(
      '.obsidian/plugins/obsidian-getnote-importer/data.json',
      '.obsidian/plugins/dedao-brain-sync/data.json'
    );
  });

  it('does not overwrite data.json that already exists for the current plugin', async () => {
    const adapter = makeAdapter([
      '.obsidian/plugins/dedao-brain-sync/data.json',
      '.obsidian/plugins/obsidian-getnote-importer/data.json',
    ]);

    const migrated = await migrateLegacyPluginData(adapter, 'dedao-brain-sync');

    expect(migrated).toBe(false);
    expect(adapter.copy).not.toHaveBeenCalled();
  });

  it('falls back to the later getnote-importer directory when the original directory has no data', async () => {
    const adapter = makeAdapter([
      '.obsidian/plugins/getnote-importer/data.json',
    ]);

    const migrated = await migrateLegacyPluginData(adapter, 'dedao-brain-sync');

    expect(migrated).toBe(true);
    expect(adapter.copy).toHaveBeenCalledWith(
      '.obsidian/plugins/getnote-importer/data.json',
      '.obsidian/plugins/dedao-brain-sync/data.json'
    );
  });

  it('shows an official Obsidian notice after a successful legacy migration', () => {
    notifyLegacyPluginDataMigrated(true);

    expect(issuedNotices).toEqual([
      {
        message: '已经从旧的 GetNote Importer 迁移成功，请手动停止和卸载 GetNote Importer',
        timeout: 10000,
      },
    ]);
  });

  it('does not show the migration notice when no legacy data was migrated', () => {
    notifyLegacyPluginDataMigrated(false);

    expect(issuedNotices).toEqual([]);
  });
});
