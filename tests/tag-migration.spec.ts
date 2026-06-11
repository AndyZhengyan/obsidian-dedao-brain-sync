import { describe, expect, it, vi } from 'vitest';
import { TFile } from 'obsidian';
import { migrateSyncedNoteTags } from '../src/tag-migration';

function makeVault(entries: Record<string, string>) {
  const files = new Map(Object.entries(entries));
  return {
    getMarkdownFiles: vi.fn(() => [...files.keys()].map(path => new TFile(path))),
    read: vi.fn(async (file: TFile) => files.get(file.path) ?? ''),
    modify: vi.fn(async (file: TFile, content: string) => {
      files.set(file.path, content);
    }),
    content(path: string) {
      return files.get(path);
    },
  };
}

describe('migrateSyncedNoteTags', () => {
  it('normalizes invalid tags in synced notes without changing the body', async () => {
    const vault = makeVault({
      '得到大脑/note.md': [
        '---',
        'uid: "123"',
        'source: 得到大脑',
        'tags: ["本体 is all you need", "AI"]',
        '---',
        '# 正文',
      ].join('\n'),
    });

    const result = await migrateSyncedNoteTags(vault, '得到大脑');

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(vault.content('得到大脑/note.md')).toContain('tags: ["本体-is-all-you-need", "AI"]');
    expect(vault.content('得到大脑/note.md')).toContain('---\n# 正文');
  });

  it('also migrates notes written by the old Get笔记 version', async () => {
    const vault = makeVault({
      '得到大脑/legacy.md': '---\nsource: Get笔记\ntags: ["old tag"]\n---\nbody',
    });

    const result = await migrateSyncedNoteTags(vault, '得到大脑');

    expect(result).toEqual({ scanned: 1, updated: 1 });
    expect(vault.content('得到大脑/legacy.md')).toContain('tags: ["old-tag"]');
  });

  it('does not modify notes outside the sync folder or without the synced source', async () => {
    const vault = makeVault({
      '其他/note.md': '---\nsource: 得到大脑\ntags: ["bad tag"]\n---\nbody',
      '得到大脑/local.md': '---\nsource: local\ntags: ["bad tag"]\n---\nbody',
    });

    const result = await migrateSyncedNoteTags(vault, '得到大脑');

    expect(result).toEqual({ scanned: 1, updated: 0 });
    expect(vault.modify).not.toHaveBeenCalled();
  });

  it('reports zero scanned files so startup does not mark an early migration complete', async () => {
    const vault = makeVault({});

    const result = await migrateSyncedNoteTags(vault, '得到大脑');

    expect(result).toEqual({ scanned: 0, updated: 0 });
  });
});
