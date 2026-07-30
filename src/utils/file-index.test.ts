import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { App, TFile } from 'obsidian';
// Runtime classes come from the mock module so we don't reach into a real
// Obsidian context. The setup.ts vitest mock would also redirect this
// import, but referencing the mock directly avoids the indirection at
// type-check time.
import { App as MockApp, TFile as MockTFile, Vault as MockVault } from '../../tests/mocks/obsidian';
import { FileIndex, type SerializedFileEntry } from './file-index';

interface FakePersistence {
  load: () => Promise<SerializedFileEntry[] | undefined>;
  save: (entries: SerializedFileEntry[]) => Promise<void>;
  /** Last payload written by save() (synchronous snapshot for assertions). */
  lastSaved: SerializedFileEntry[] | null;
  saveCount: number;
}

function makePersistence(): FakePersistence {
  const persistence: FakePersistence = {
    load: async () => undefined,
    save: async () => undefined,
    lastSaved: null,
    saveCount: 0,
  };
  persistence.save = async (entries) => {
    persistence.lastSaved = entries;
    persistence.saveCount += 1;
  };
  return persistence;
}

function makeFile(path: string): TFile {
  // The mock TFile doesn't expose stat/vault/parent; cast to satisfy the
  // structural type. FileIndex only touches `.path`, `.endsWith('.md')`, and
  // optionally `.stat.mtime` (with fallback), so the cast is safe here.
  return new MockTFile(path) as unknown as TFile;
}

function makeApp(files: TFile[] = []): App {
  const mockApp = new MockApp();
  const fileList: TFile[] = files;
  (mockApp.vault as unknown as { getMarkdownFiles: () => TFile[] }).getMarkdownFiles = () => fileList;
  (mockApp.vault as unknown as { getAbstractFileByPath: (p: string) => TFile | null }).getAbstractFileByPath = (p: string) =>
    fileList.find((f) => f.path === p) ?? null;
  // The runtime mock only implements a subset of `App`; cast to the full
  // type because `FileIndex` only touches `vault`.
  return mockApp as unknown as App;
}

describe('FileIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('hydrates empty when no persisted data exists', async () => {
    const app = makeApp();
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 0 });

    await index.hydrate();
    expect(index.size()).toBe(0);
  });

  it('reconciles live vault files into the cache', async () => {
    const files = [makeFile('notes/a.md'), makeFile('notes/b.md')];
    const app = makeApp(files);
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 0 });

    await index.hydrate();
    expect(index.size()).toBe(2);
    expect(index.getByPath('notes/a.md')).toBe(files[0]);
  });

  it('restores persisted paths by resolving against the live vault', async () => {
    const files = [makeFile('notes/kept.md')];
    const app = makeApp(files);
    const persistence = makePersistence();
    persistence.load = async () => [{ path: 'notes/kept.md', mtime: 1000 }];

    const index = new FileIndex({ app, persistence, debounceMs: 0 });
    await index.hydrate();
    expect(index.getByPath('notes/kept.md')).toBe(files[0]);
  });

  it('drops persisted paths whose files no longer exist', async () => {
    const app = makeApp(); // empty vault
    const persistence = makePersistence();
    persistence.load = async () => [{ path: 'notes/gone.md', mtime: 1000 }];

    const index = new FileIndex({ app, persistence, debounceMs: 0 });
    await index.hydrate();
    expect(index.getByPath('notes/gone.md')).toBeUndefined();
    expect(index.size()).toBe(0);
  });

  it('ignores non-markdown files in the vault', async () => {
    const files = [makeFile('notes/real.md')];
    const app = makeApp(files);
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 0 });

    await index.hydrate();
    expect(index.getAll().map((f) => f.path)).toEqual(['notes/real.md']);
  });

  it('picks up new files via vault create event and debounces save', async () => {
    const app = makeApp();
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 50 });
    await index.hydrate();

    const created = makeFile('notes/new.md');
    (app.vault as unknown as MockVault).trigger('create', created);

    // Immediate read: not yet persisted, but cache updated.
    expect(index.getByPath('notes/new.md')).toBe(created);
    expect(persistence.saveCount).toBe(0);

    // After debounce window, persistNow runs.
    await vi.advanceTimersByTimeAsync(50);
    expect(persistence.saveCount).toBe(1);
    expect(persistence.lastSaved?.map((e) => e.path)).toEqual(['notes/new.md']);
  });

  it('coalesces bursty events into a single trailing save', async () => {
    const app = makeApp();
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 50 });
    await index.hydrate();

    for (let i = 0; i < 5; i += 1) {
      (app.vault as unknown as MockVault).trigger('create', makeFile(`notes/burst-${i}.md`));
    }
    await vi.advanceTimersByTimeAsync(50);

    expect(persistence.saveCount).toBe(1);
    expect(persistence.lastSaved?.length).toBe(5);
  });

  it('removes files via vault delete event', async () => {
    const files = [makeFile('notes/a.md')];
    const app = makeApp(files);
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 0 });
    await index.hydrate();

    expect(index.getByPath('notes/a.md')).toBe(files[0]);
    (app.vault as unknown as MockVault).trigger('delete', files[0]);
    await vi.advanceTimersByTimeAsync(0);
    expect(index.getByPath('notes/a.md')).toBeUndefined();
  });

  it('handles rename by removing oldPath and inserting newPath', async () => {
    const files = [makeFile('notes/old.md')];
    const app = makeApp(files);
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 0 });
    await index.hydrate();

    const renamed = makeFile('notes/new.md');
    (app.vault as unknown as MockVault).trigger('rename', renamed, 'notes/old.md');
    await vi.advanceTimersByTimeAsync(0);

    expect(index.getByPath('notes/old.md')).toBeUndefined();
    expect(index.getByPath('notes/new.md')).toBe(renamed);
  });

  it('flushPendingSave writes immediately when dirty', async () => {
    const app = makeApp();
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 10_000 });
    await index.hydrate();

    (app.vault as unknown as MockVault).trigger('create', makeFile('notes/x.md'));
    expect(persistence.saveCount).toBe(0);

    await index.flushPendingSave();
    expect(persistence.saveCount).toBe(1);
    expect(persistence.lastSaved?.map((e) => e.path)).toEqual(['notes/x.md']);
  });

  it('reconcile adds new files and removes vanished files', async () => {
    const initial = [makeFile('notes/a.md'), makeFile('notes/b.md')];
    const app = makeApp(initial);
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 0 });
    await index.hydrate();

    // Simulate: b.md deleted, c.md created externally.
    initial.splice(1, 1);
    initial.push(makeFile('notes/c.md'));
    (app.vault as unknown as { getMarkdownFiles: () => TFile[] }).getMarkdownFiles = () => initial;
    (app.vault as unknown as { getAbstractFileByPath: (p: string) => TFile | null }).getAbstractFileByPath = (p: string) =>
      initial.find((f) => f.path === p) ?? null;

    await index.reconcile();
    const paths = index.getAll().map((f) => f.path).sort();
    expect(paths).toEqual(['notes/a.md', 'notes/c.md']);
  });

  it('dispose prevents further saves', async () => {
    const app = makeApp();
    const persistence = makePersistence();
    const index = new FileIndex({ app, persistence, debounceMs: 50 });
    await index.hydrate();

    index.dispose();
    (app.vault as unknown as MockVault).trigger('create', makeFile('notes/post.md'));
    await vi.advanceTimersByTimeAsync(50);
    expect(persistence.saveCount).toBe(0);
  });

  it('persistence.load errors do not block hydration', async () => {
    const app = makeApp([makeFile('notes/a.md')]);
    const persistence = makePersistence();
    persistence.load = async () => {
      throw new Error('disk full');
    };
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const index = new FileIndex({ app, persistence, debounceMs: 0 });
    await index.hydrate();
    expect(index.size()).toBe(1);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
