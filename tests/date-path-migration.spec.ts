import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TFile, type App } from 'obsidian';
import {
  migrateDatePaths,
  type DatePathCategoryOrigin,
  type DatePathMigrationIssueCode,
  type DatePathMigrationTarget,
} from '../src/date-path-migration';

type Cache = {
  frontmatter?: Record<string, unknown>;
  embeds?: Array<{ link: string }>;
  links?: Array<{ link: string }>;
};

type MigrationApp = Pick<App, 'vault' | 'metadataCache' | 'fileManager'> & {
  vault: App['vault'] & {
    addFile(path: string, content: string, cache?: Cache): TFile;
    content(path: string): string | undefined;
    paths(): string[];
    failRename(from: string, to: string): void;
    clearRenameFailures(): void;
  };
};

function dirname(path: string): string {
  const separator = path.lastIndexOf('/');
  return separator < 0 ? '' : path.slice(0, separator);
}

function makeApp(): MigrationApp {
  const files = new Map<string, { file: TFile; content: string }>();
  const caches = new Map<string, Cache>();
  const folders = new Set<string>(['得到大脑']);
  const failedRenames = new Set<string>();

  const ensureParentFolders = (path: string) => {
    const parts = dirname(path).split('/').filter(Boolean);
    for (let index = 1; index <= parts.length; index++) {
      folders.add(parts.slice(0, index).join('/'));
    }
  };

  const vault = {
    addFile(path: string, content: string, cache: Cache = {}) {
      ensureParentFolders(path);
      const file = new TFile(path);
      files.set(path, { file, content });
      caches.set(path, cache);
      return file;
    },
    content(path: string) {
      return files.get(path)?.content;
    },
    paths() {
      return [...files.keys()].sort();
    },
    failRename(from: string, to: string) {
      failedRenames.add(`${from}=>${to}`);
    },
    clearRenameFailures() {
      failedRenames.clear();
    },
    getMarkdownFiles: () =>
      [...files.values()]
        .filter(({ file }) => file.extension === 'md')
        .map(({ file }) => file),
    getAbstractFileByPath: (path: string) =>
      files.get(path)?.file ?? (folders.has(path) ? { path } : null),
    createFolder: vi.fn(async (path: string) => {
      const parts = path.split('/').filter(Boolean);
      for (let index = 1; index <= parts.length; index++) {
        folders.add(parts.slice(0, index).join('/'));
      }
    }),
    read: vi.fn(async (file: TFile) => files.get(file.path)?.content ?? ''),
    rename: vi.fn(async (file: TFile, targetPath: string) => {
      const sourcePath = file.path;
      if (failedRenames.has(`${sourcePath}=>${targetPath}`)) {
        throw new Error(`rename failed: ${sourcePath}`);
      }
      if (files.has(targetPath)) throw new Error(`target exists: ${targetPath}`);
      const entry = files.get(sourcePath);
      if (!entry) throw new Error(`source missing: ${sourcePath}`);
      files.delete(sourcePath);
      files.set(targetPath, entry);
      const cache = caches.get(sourcePath);
      caches.delete(sourcePath);
      if (cache) caches.set(targetPath, cache);
      file.path = targetPath;
      file.name = targetPath.split('/').pop() ?? '';
      file.basename = file.name.replace(/\.[^.]+$/, '');
      file.extension = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
    }),
  };

  const fileManager = {
    renameFile: vi.fn(async (file: TFile, targetPath: string) => {
      const sourcePath = file.path;
      await vault.rename(file, targetPath);
      const sourceLink = sourcePath.replace(/\.md$/, '');
      const targetLink = targetPath.replace(/\.md$/, '');
      for (const entry of files.values()) {
        entry.content = entry.content.replaceAll(sourceLink, targetLink);
      }
    }),
  };

  const metadataCache = {
    getFileCache: (file: TFile) => caches.get(file.path) ?? null,
    getFirstLinkpathDest: (linkpath: string, sourcePath: string) => {
      const normalized = linkpath.replace(/^\.\//, '');
      const candidates = [
        `${dirname(sourcePath)}/${normalized}`,
        `${dirname(sourcePath)}/asset/${normalized}`,
        normalized,
      ];
      for (const candidate of candidates) {
        const withExtension = files.has(candidate)
          ? candidate
          : files.has(`${candidate}.md`)
            ? `${candidate}.md`
            : candidate;
        const resolved = files.get(withExtension)?.file;
        if (resolved) return resolved;
      }
      return null;
    },
  };

  return { vault, fileManager, metadataCache } as unknown as MigrationApp;
}

function pluginCache(
  overrides: Partial<Record<'uid' | 'created' | 'note_type' | 'source', unknown>> = {},
  links: Cache = {},
): Cache {
  return {
    frontmatter: {
      uid: '1909193892067130512',
      created: '2026-07-03T10:20:30+08:00',
      note_type: 'plain_text',
      source: '得到大脑',
      ...overrides,
    },
    ...links,
  };
}

function issueCodes(result: Awaited<ReturnType<typeof migrateDatePaths>>): DatePathMigrationIssueCode[] {
  return result.issues.map(issue => issue.code);
}

describe('migrateDatePaths', () => {
  let app: MigrationApp;
  let currentLayout: DatePathMigrationTarget;
  let categoryOrigins: Record<string, DatePathCategoryOrigin>;

  beforeEach(() => {
    app = makeApp();
    currentLayout = { enabled: false, format: 'YYYY/MM' };
    categoryOrigins = {};
  });

  const migrate = async (
    target: DatePathMigrationTarget,
    rootFolder = '得到大脑',
  ) => {
    const source = currentLayout;
    return migrateDatePaths(app, rootFolder, target, {
      source,
      categoryOrigins,
      beforeExecute: async nextOrigins => {
        categoryOrigins = nextOrigins;
        currentLayout = target;
      },
    });
  };

  it('enables created-date paths for normal notes without changing markdown bytes', async () => {
    const source = '得到大脑/纯文本/历史.md';
    const original = '---\r\nuid: "1909193892067130512"\r\n---\r\n正文\r\n';
    app.vault.addFile(source, original, pluginCache());

    const result = await migrate({
      enabled: true,
      format: 'YYYY/MM',
    });

    expect(result).toMatchObject({ scanned: 1, moved: 1, unchanged: 0, skipped: 0, failed: 0 });
    expect(app.vault.paths()).toEqual(['得到大脑/2026/07/纯文本/历史.md']);
    expect(app.vault.content('得到大脑/2026/07/纯文本/历史.md')).toBe(original);
  });

  it('moves only notes with current or legacy plugin ownership markers', async () => {
    app.vault.addFile('得到大脑/纯文本/当前.md', 'current', pluginCache({ uid: 'current' }));
    app.vault.addFile('得到大脑/纯文本/旧版.md', 'legacy', pluginCache({
      uid: 'legacy',
      source: 'Get笔记',
    }));
    app.vault.addFile('得到大脑/纯文本/用户.md', 'user', pluginCache({
      uid: 'user',
      source: '手工笔记',
    }));
    app.vault.addFile('得到大脑/纯文本/无来源.md', 'missing', pluginCache({
      uid: 'missing',
      source: undefined,
    }));

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ scanned: 2, moved: 2, skipped: 0, failed: 0 });
    expect(result.issues).toEqual([]);
    expect(app.vault.paths()).toEqual([
      '得到大脑/2026/07/纯文本/当前.md',
      '得到大脑/2026/07/纯文本/旧版.md',
      '得到大脑/纯文本/无来源.md',
      '得到大脑/纯文本/用户.md',
    ]);
  });

  it('throws for a root folder with surrounding whitespace before scanning the trimmed root', async () => {
    app.vault.addFile('得到大脑/纯文本/不可触碰.md', 'note', pluginCache());
    const scan = vi.spyOn(app.vault, 'getMarkdownFiles');

    await expect(migrate({
      enabled: true,
      format: 'YYYY/MM',
    }, ' 得到大脑 ')).rejects.toThrow('Unsafe root folder');

    expect(scan).not.toHaveBeenCalled();
    expect(app.vault.paths()).toEqual(['得到大脑/纯文本/不可触碰.md']);
  });

  it('enables, changes format, and disables knowledge-base paths using the created date', async () => {
    app.vault.addFile(
      '得到大脑/知识库/写作/历史.md',
      'kb',
      pluginCache({ uid: 'kb-1', note_type: 'img_text' }),
    );

    const enabled = await migrate({ enabled: true, format: 'YYYY/MM' });
    const reformatted = await migrate({ enabled: true, format: 'YYYY-MM-DD' });
    const disabled = await migrate({ enabled: false, format: 'YYYY-MM-DD' });

    expect(enabled.moved).toBe(1);
    expect(reformatted.moved).toBe(1);
    expect(disabled.moved).toBe(1);
    expect(app.vault.paths()).toEqual(['得到大脑/知识库/写作/历史.md']);
  });

  it('preserves a custom category hierarchy through enable, format change, and disable', async () => {
    const originalPath = '得到大脑/项目/客户甲/历史.md';
    app.vault.addFile(originalPath, 'custom', pluginCache({ uid: 'custom-category' }));

    const enabled = await migrate({ enabled: true, format: 'YYYY/MM' });
    expect(enabled.moved).toBe(1);
    expect(app.vault.paths()).toEqual(['得到大脑/2026/07/项目/客户甲/历史.md']);

    const reformatted = await migrate({ enabled: true, format: 'YYYY-MM-DD' });
    expect(reformatted.moved).toBe(1);
    expect(app.vault.paths()).toEqual(['得到大脑/2026-07-03/项目/客户甲/历史.md']);

    const disabled = await migrate({ enabled: false, format: 'YYYY-MM-DD' });
    expect(disabled.moved).toBe(1);
    expect(app.vault.paths()).toEqual([originalPath]);
  });

  it('replaces the entire prior date layer when changing to a shorter format', async () => {
    app.vault.addFile(
      '得到大脑/项目/历史.md',
      'custom',
      pluginCache({ uid: 'shorter-date-format' }),
    );

    await migrate({ enabled: true, format: 'YYYY/MM/DD' });
    const reformatted = await migrate({ enabled: true, format: 'YYYY' });

    expect(reformatted.moved).toBe(1);
    expect(app.vault.paths()).toEqual(['得到大脑/2026/项目/历史.md']);
  });

  it('preserves a date-like custom category instead of treating it as a generated layer', async () => {
    const originalPath = '得到大脑/2026/项目/日期同名目录.md';
    const uid = 'date-like-custom-category';
    app.vault.addFile(originalPath, 'custom', pluginCache({ uid }));

    const enabled = await migrate({ enabled: true, format: 'YYYY' });

    expect(enabled.moved).toBe(1);
    expect(app.vault.paths()).toEqual(['得到大脑/2026/2026/项目/日期同名目录.md']);

    const disabled = await migrate({ enabled: false, format: 'YYYY' });

    expect(disabled.moved).toBe(1);
    expect(app.vault.paths()).toEqual([originalPath]);
  });

  it('resumes a failed date-like custom-category move from its persisted origin', async () => {
    const source = '得到大脑/2026/项目/待恢复.md';
    const target = '得到大脑/2026/2026/项目/待恢复.md';
    app.vault.addFile(source, 'custom', pluginCache({ uid: 'date-like-resume' }));
    app.vault.failRename(source, target);

    const failed = await migrate({ enabled: true, format: 'YYYY' });
    app.vault.clearRenameFailures();
    const resumed = await migrate({ enabled: true, format: 'YYYY' });

    expect(failed).toMatchObject({ moved: 0, failed: 1 });
    expect(resumed).toMatchObject({ moved: 1, skipped: 0, failed: 0 });
    expect(app.vault.paths()).toEqual([target]);
  });

  it('skips a move that would break an external path-qualified inbound link', async () => {
    const source = '得到大脑/纯文本/被引用.md';
    app.vault.addFile(source, 'synced', pluginCache({ uid: 'inbound-target' }));
    app.vault.addFile(
      '个人笔记/索引.md',
      '[[得到大脑/纯文本/被引用]]',
      { links: [{ link: '得到大脑/纯文本/被引用' }] },
    );

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ moved: 0, skipped: 1, failed: 0 });
    expect(issueCodes(result)).toContain('inbound-link');
    expect(app.vault.paths()).toContain(source);
    expect(app.vault.content('个人笔记/索引.md')).toBe('[[得到大脑/纯文本/被引用]]');
    expect(app.fileManager.renameFile).not.toHaveBeenCalled();
  });

  it('skips the whole note when an external path-qualified link targets its asset', async () => {
    const notePath = '得到大脑/图片笔记/带外链附件.md';
    const assetPath = '得到大脑/图片笔记/asset/带外链附件_image.png';
    const noteContent = '![[asset/带外链附件_image.png]]';
    const indexContent = '![[得到大脑/图片笔记/asset/带外链附件_image.png]]';
    app.vault.addFile(notePath, noteContent, pluginCache(
      { uid: 'external-asset-link', note_type: 'img_text' },
      { embeds: [{ link: 'asset/带外链附件_image.png' }] },
    ));
    app.vault.addFile(assetPath, 'image');
    app.vault.addFile(
      '个人笔记/附件索引.md',
      indexContent,
      { embeds: [{ link: '得到大脑/图片笔记/asset/带外链附件_image.png' }] },
    );

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ moved: 0, skipped: 1, failed: 0 });
    expect(issueCodes(result)).toContain('inbound-link');
    expect(app.vault.paths()).toEqual([
      '个人笔记/附件索引.md',
      assetPath,
      notePath,
    ]);
    expect(app.vault.content(notePath)).toBe(noteContent);
    expect(app.vault.content('个人笔记/附件索引.md')).toBe(indexContent);
    expect(app.vault.rename).not.toHaveBeenCalled();
  });

  it('moves only exact referenced adjacent assets and leaves unreferenced siblings in place', async () => {
    const notePath = '得到大脑/图片笔记/带图.md';
    app.vault.addFile(notePath, '![[asset/带图_image.png]]', pluginCache({ note_type: 'img_text' }, {
      embeds: [{ link: 'asset/带图_image.png' }],
    }));
    app.vault.addFile('得到大脑/图片笔记/asset/带图_image.png', 'image');
    app.vault.addFile('得到大脑/图片笔记/asset/未引用.png', 'orphan');

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result.moved).toBe(1);
    expect(app.vault.paths()).toEqual([
      '得到大脑/2026/07/图片笔记/asset/带图_image.png',
      '得到大脑/2026/07/图片笔记/带图.md',
      '得到大脑/图片笔记/asset/未引用.png',
    ]);
  });

  it('skips malformed metadata and unresolved generated assets but ignores ordinary broken links', async () => {
    app.vault.addFile('得到大脑/纯文本/缺元数据.md', 'bad', pluginCache({ created: 123 }));
    app.vault.addFile('得到大脑/纯文本/缺附件.md', '![[asset/笔记_image.png]]', pluginCache(
      { uid: 'missing-asset' },
      { embeds: [{ link: 'asset/笔记_image.png' }] },
    ));
    app.vault.addFile('得到大脑/纯文本/普通断链.md', '[[不存在的普通笔记]]', pluginCache(
      { uid: 'broken-link' },
      { links: [{ link: '不存在的普通笔记' }] },
    ));

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ scanned: 3, moved: 1, skipped: 2, failed: 0 });
    expect(issueCodes(result)).toEqual(expect.arrayContaining(['invalid-metadata', 'missing-generated-asset']));
    expect(app.vault.paths()).toContain('得到大脑/2026/07/纯文本/普通断链.md');
    expect(app.vault.paths()).toContain('得到大脑/纯文本/缺元数据.md');
    expect(app.vault.paths()).toContain('得到大脑/纯文本/缺附件.md');
  });

  it('globally preflights existing targets and shared assets without moving affected notes', async () => {
    app.vault.addFile('得到大脑/纯文本/冲突.md', 'source', pluginCache({ uid: 'conflict' }));
    app.vault.addFile('得到大脑/2026/07/纯文本/冲突.md', 'occupied');

    for (const [name, uid] of [['一', 'shared-1'], ['二', 'shared-2']] as const) {
      app.vault.addFile(`得到大脑/纯文本/${name}.md`, '[[asset/shared.png]]', pluginCache(
        { uid },
        { embeds: [{ link: 'asset/shared.png' }] },
      ));
    }
    app.vault.addFile('得到大脑/纯文本/asset/shared.png', 'shared');

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ scanned: 3, moved: 0, skipped: 3, failed: 0 });
    expect(issueCodes(result)).toEqual(expect.arrayContaining(['target-conflict', 'shared-asset']));
  });

  it('lets non-plugin notes claim adjacent assets so plugin plans cannot move user-owned files', async () => {
    app.vault.addFile('得到大脑/图片笔记/插件.md', '[[asset/shared.png]]', pluginCache(
      { uid: 'plugin', note_type: 'img_text' },
      { embeds: [{ link: 'asset/shared.png' }] },
    ));
    app.vault.addFile('得到大脑/图片笔记/用户.md', '[[asset/shared.png]]', pluginCache(
      { uid: 'user', note_type: 'img_text', source: '手工笔记' },
      { embeds: [{ link: 'asset/shared.png' }] },
    ));
    app.vault.addFile('得到大脑/图片笔记/asset/shared.png', 'user-owned');

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ scanned: 1, moved: 0, skipped: 1, failed: 0 });
    expect(issueCodes(result)).toEqual(['shared-asset']);
    expect(app.vault.paths()).toEqual([
      '得到大脑/图片笔记/asset/shared.png',
      '得到大脑/图片笔记/插件.md',
      '得到大脑/图片笔记/用户.md',
    ]);
  });

  it('keeps UID and asset claims from plugin notes that later fail planning', async () => {
    app.vault.addFile('得到大脑/图片笔记/有效.md', '[[asset/shared.png]]', pluginCache(
      { uid: 'claimed', note_type: 'img_text' },
      { embeds: [{ link: 'asset/shared.png' }] },
    ));
    app.vault.addFile('得到大脑/图片笔记/无效.md', '[[asset/shared.png]]', pluginCache(
      { uid: 'claimed', created: 'not-a-date', note_type: 'img_text' },
      { embeds: [{ link: 'asset/shared.png' }] },
    ));
    app.vault.addFile('得到大脑/图片笔记/asset/shared.png', 'shared');

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ scanned: 2, moved: 0, skipped: 2, failed: 0 });
    expect(issueCodes(result)).toEqual(expect.arrayContaining([
      'unsafe-path',
      'duplicate-uid',
      'shared-asset',
    ]));
    expect(app.vault.paths()).toContain('得到大脑/图片笔记/有效.md');
    expect(app.vault.paths()).toContain('得到大脑/图片笔记/asset/shared.png');
  });

  it('rolls back moved assets when markdown rename fails and continues with later notes', async () => {
    app.vault.addFile('得到大脑/图片笔记/失败.md', '[[asset/失败_image.png]]', pluginCache(
      { uid: 'failure', note_type: 'img_text' },
      { embeds: [{ link: 'asset/失败_image.png' }] },
    ));
    app.vault.addFile('得到大脑/图片笔记/asset/失败_image.png', 'image');
    app.vault.failRename(
      '得到大脑/图片笔记/失败.md',
      '得到大脑/2026/07/图片笔记/失败.md',
    );
    app.vault.addFile('得到大脑/纯文本/继续.md', 'ok', pluginCache({ uid: 'continue' }));

    const result = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(result).toMatchObject({ scanned: 2, moved: 1, skipped: 0, failed: 1 });
    expect(issueCodes(result)).toContain('rename-failed');
    expect(app.vault.paths()).toEqual([
      '得到大脑/2026/07/纯文本/继续.md',
      '得到大脑/图片笔记/asset/失败_image.png',
      '得到大脑/图片笔记/失败.md',
    ]);
  });

  it('resumes when an interrupted run already moved the deterministic target asset', async () => {
    app.vault.addFile('得到大脑/图片笔记/崩溃.md', '[[asset/崩溃_image.png]]', pluginCache(
      { uid: 'crash', note_type: 'img_text' },
      { embeds: [{ link: 'asset/崩溃_image.png' }] },
    ));
    app.vault.addFile('得到大脑/2026/07/图片笔记/asset/崩溃_image.png', 'image');

    const resumed = await migrate({ enabled: true, format: 'YYYY/MM' });
    const repeated = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(resumed).toMatchObject({ scanned: 1, moved: 1, skipped: 0, failed: 0 });
    expect(repeated).toMatchObject({ scanned: 1, moved: 0, unchanged: 1, skipped: 0, failed: 0 });
    expect(app.vault.paths()).toEqual([
      '得到大脑/2026/07/图片笔记/asset/崩溃_image.png',
      '得到大脑/2026/07/图片笔记/崩溃.md',
    ]);
  });

  it('retries safely after rollback itself left an asset at the deterministic target', async () => {
    const noteSource = '得到大脑/图片笔记/回滚失败.md';
    const noteTarget = '得到大脑/2026/07/图片笔记/回滚失败.md';
    const assetSource = '得到大脑/图片笔记/asset/回滚失败_image.png';
    const assetTarget = '得到大脑/2026/07/图片笔记/asset/回滚失败_image.png';
    app.vault.addFile(noteSource, '[[asset/回滚失败_image.png]]', pluginCache(
      { uid: 'rollback-crash', note_type: 'img_text' },
      { embeds: [{ link: 'asset/回滚失败_image.png' }] },
    ));
    app.vault.addFile(assetSource, 'image');
    app.vault.failRename(noteSource, noteTarget);
    app.vault.failRename(assetTarget, assetSource);

    const failed = await migrate({ enabled: true, format: 'YYYY/MM' });
    app.vault.clearRenameFailures();
    const retried = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(failed).toMatchObject({ moved: 0, failed: 1 });
    expect(issueCodes(failed)).toEqual(expect.arrayContaining(['rename-failed', 'rollback-failed']));
    expect(retried).toMatchObject({ scanned: 1, moved: 1, skipped: 0, failed: 0 });
    expect(app.vault.paths()).toEqual([assetTarget, noteTarget]);
  });

  it('is idempotent and reconciles misplaced notes even when the target setting is unchanged', async () => {
    app.vault.addFile('得到大脑/纯文本/错位.md', 'note', pluginCache({ uid: 'misplaced' }));

    const first = await migrate({ enabled: true, format: 'YYYY/MM' });
    const second = await migrate({ enabled: true, format: 'YYYY/MM' });

    expect(first.moved).toBe(1);
    expect(second).toMatchObject({ scanned: 1, moved: 0, unchanged: 1, skipped: 0, failed: 0 });
    expect(second.issues).toEqual([]);
  });
});
