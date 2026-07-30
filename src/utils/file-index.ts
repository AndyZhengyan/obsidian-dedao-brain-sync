/**
 * FileIndex — in-memory cache of the vault's Markdown files.
 *
 * Wraps `app.vault.getMarkdownFiles()` with a Map-backed index so call sites
 * can avoid paying the full-vault enumeration cost on every interaction. The
 * cache is hydrated from `data.json` on plugin load, reconciled asynchronously
 * against the live vault, and kept up to date via vault events. A trailing-edge
 * debounce coalesces writes back to `data.json`.
 *
 * Storage format in `data.json` (under field `fileIndex`):
 *   Array<{ path: string; mtime: number }>
 *
 * `TFile` is intentionally NOT stored directly — Obsidian's TFile instances
 * carry non-serialisable references that cannot survive a `saveData` round
 * trip. On hydration, fresh TFile objects are looked up via
 * `app.vault.getAbstractFileByPath()` and reconciled against the live vault.
 *
 * `mtime` is treated as a best-effort hint. When `file.stat` is unavailable
 * (e.g. minimal test mocks, freshly-created files before Obsidian populates
 * stat) we fall back to `Date.now()` so the cache stays populated rather
 * than silently dropping entries.
 */
import type { App, TFile, Vault } from 'obsidian';

export interface SerializedFileEntry {
  /** Vault-relative path (e.g. "得到大脑/纯文本/note.md"). */
  path: string;
  /**
   * Last-known `file.stat.mtime` in milliseconds. Used as a cheap "still the
   * same content?" hint during hydration; full reconciliation runs after load
   * regardless.
   */
  mtime: number;
}

/**
 * Minimal persistence surface — accepts a key into the shared data.json
 * payload so callers can control how the field is merged with their own
 * settings save flow.
 */
export interface FileIndexPersistence {
  /** Returns the persisted `fileIndex` field (or `undefined` if absent). */
  load(): Promise<SerializedFileEntry[] | undefined>;
  /**
   * Persist the latest `fileIndex` payload. The implementation decides how
   * this is merged into the shared data.json (e.g. alongside settings).
   * Returns a promise that resolves once the write is flushed.
   */
  save(entries: SerializedFileEntry[]): Promise<void>;
}

export interface FileIndexOptions {
  app: App;
  persistence: FileIndexPersistence;
  /** Trailing-edge debounce window for saves, in ms. Defaults to 5000. */
  debounceMs?: number;
  /**
   * Callback used to register the vault event listeners via
   * `Plugin.registerEvent()` so Obsidian cleans them up on unload. When
   * omitted (e.g. in unit tests), listeners are attached directly and must
   * be removed via `dispose()`.
   */
  registerEvent?: (ref: unknown) => void;
}

/**
 * In-memory file cache. All public methods are synchronous after the
 * initial async hydration completes.
 */
export class FileIndex {
  private readonly app: App;
  private readonly persistence: FileIndexPersistence;
  private readonly debounceMs: number;
  private readonly registerEvent: ((ref: unknown) => void) | null;

  /** path → live TFile. Only present for files we believe still exist. */
  private readonly byPath: Map<string, TFile> = new Map();
  /** path → last seen mtime. Survives hydration for cheap diffing. */
  private readonly mtimes: Map<string, number> = new Map();

  private hydrated = false;
  private dirty = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private disposed = false;

  constructor(options: FileIndexOptions) {
    this.app = options.app;
    this.persistence = options.persistence;
    this.debounceMs = options.debounceMs ?? 5000;
    this.registerEvent = options.registerEvent ?? null;
  }

  /**
   * Hydrate the cache from persisted data, then reconcile against the live
   * vault. Safe to call once on plugin load. The returned promise resolves
   * after the initial reconciliation pass completes (or fails gracefully).
   */
  async hydrate(): Promise<void> {
    if (this.hydrated) return;
    let persisted: SerializedFileEntry[] | undefined;
    try {
      persisted = await this.persistence.load();
    } catch (err) {
      console.warn('[DedaoBrain] Failed to load persisted file index:', err);
    }

    if (persisted) {
      for (const entry of persisted) {
        if (typeof entry?.path !== 'string') continue;
        const abstract = this.app.vault.getAbstractFileByPath(entry.path);
        if (this.isTFile(abstract)) {
          this.byPath.set(entry.path, abstract);
          this.mtimes.set(entry.path, this.readMtime(abstract, entry.mtime));
        }
      }
    }

    this.attachListeners();
    await this.reconcile();
    this.hydrated = true;
  }

  /**
   * Force a full reconciliation: re-read `vault.getMarkdownFiles()` and
   * diff against the current cache. Drops entries whose files are gone and
   * adds entries for newly-seen files.
   */
  async reconcile(): Promise<void> {
    if (this.disposed) return;
    try {
      const live = this.app.vault.getMarkdownFiles();
      const livePaths = new Set<string>();
      for (const file of live) {
        if (!this.isTFile(file)) continue;
        const path = file.path;
        if (!path.endsWith('.md')) continue;
        livePaths.add(path);
        const known = this.byPath.get(path);
        const newMtime = this.readMtime(file, this.mtimes.get(path) ?? 0);
        if (!known || known !== file || this.mtimes.get(path) !== newMtime) {
          this.byPath.set(path, file);
          this.mtimes.set(path, newMtime);
          this.markDirty();
        }
      }
      for (const path of Array.from(this.byPath.keys())) {
        if (!livePaths.has(path)) {
          this.byPath.delete(path);
          this.mtimes.delete(path);
          this.markDirty();
        }
      }
    } catch (err) {
      console.warn('[DedaoBrain] FileIndex reconciliation failed:', err);
    }
  }

  /** Returns every cached Markdown file. Order is insertion order. */
  getAll(): TFile[] {
    return Array.from(this.byPath.values());
  }

  /** Returns the cached file for `path`, or `undefined` if absent. */
  getByPath(path: string): TFile | undefined {
    return this.byPath.get(path);
  }

  /** Number of cached files. */
  size(): number {
    return this.byPath.size;
  }

  /**
   * Flush any pending debounced save synchronously (best-effort). Call from
   * `onunload()` to avoid losing the latest state.
   */
  async flushPendingSave(): Promise<void> {
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (this.dirty) {
      await this.persistNow();
    }
  }

  /**
   * Tear down vault listeners and cancel any pending save. When listeners
   * were registered through `Plugin.registerEvent`, Obsidian handles cleanup
   * automatically; `dispose()` is still safe to call and will short-circuit.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.saveTimer !== null) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    const vault = this.app.vault as unknown as Vault;
    for (const event of VAULT_EVENTS) {
      const handlers = this.vaultHandlers.get(event);
      if (!handlers) continue;
      for (const handler of handlers) {
        vault.off(event, handler);
      }
    }
  }

  // ---- internals ----

  private readonly vaultHandlers: Map<string, Array<(...args: unknown[]) => void>> = new Map();

  private attachListeners(): void {
    const vault = this.app.vault as unknown as Vault & {
      on: (name: string, cb: (...args: unknown[]) => void) => unknown;
    };

    const onCreate = (file: unknown): void => {
      if (!this.isTFile(file)) return;
      const path = file.path;
      if (!path.endsWith('.md')) return;
      this.byPath.set(path, file);
      this.mtimes.set(path, this.readMtime(file));
      this.markDirty();
    };
    const onDelete = (file: unknown): void => {
      const path = this.extractPath(file);
      if (!path) return;
      if (this.byPath.delete(path)) {
        this.mtimes.delete(path);
        this.markDirty();
      }
    };
    const onRename = (file: unknown, ...rest: unknown[]): void => {
      const oldPath = rest[0];
      if (typeof oldPath === 'string' && this.byPath.delete(oldPath)) {
        this.mtimes.delete(oldPath);
        this.markDirty();
      }
      if (!this.isTFile(file)) return;
      const newPath = file.path;
      if (!newPath.endsWith('.md')) return;
      this.byPath.set(newPath, file);
      this.mtimes.set(newPath, this.readMtime(file));
      this.markDirty();
    };
    const onModify = (file: unknown): void => {
      if (!this.isTFile(file)) return;
      const path = file.path;
      this.byPath.set(path, file);
      this.mtimes.set(path, this.readMtime(file));
      this.markDirty();
    };

    this.vaultHandlers.set('create', [onCreate]);
    this.vaultHandlers.set('delete', [onDelete]);
    this.vaultHandlers.set('rename', [onRename]);
    this.vaultHandlers.set('modify', [onModify]);
    for (const [event, handlers] of this.vaultHandlers) {
      for (const handler of handlers) {
        const ref = vault.on(event, handler);
        if (this.registerEvent) this.registerEvent(ref);
      }
    }
  }

  private markDirty(): void {
    if (this.disposed) return;
    this.dirty = true;
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.persistNow();
    }, this.debounceMs);
  }

  private async persistNow(): Promise<void> {
    if (this.disposed) return;
    this.dirty = false;
    const payload = this.serialize();
    try {
      await this.persistence.save(payload);
    } catch (err) {
      // Mark dirty again so a subsequent mutation (or shutdown flush) retries.
      this.dirty = true;
      console.warn('[DedaoBrain] Failed to persist file index:', err);
    }
  }

  private serialize(): SerializedFileEntry[] {
    const entries: SerializedFileEntry[] = [];
    for (const [path, file] of this.byPath) {
      entries.push({ path, mtime: this.mtimes.get(path) ?? this.readMtime(file) });
    }
    return entries;
  }

  /**
   * Type guard for TFile. We deliberately only require a string `path` and
   * either `.md` extension or basename — the test mock TFile has no `stat`,
   * so checking `stat.mtime` would falsely reject every mock file.
   */
  private isTFile(value: unknown): value is TFile {
    return (
      typeof value === 'object' &&
      value !== null &&
      typeof (value as { path?: unknown }).path === 'string'
    );
  }

  private extractPath(value: unknown): string | null {
    if (value && typeof value === 'object' && typeof (value as { path?: unknown }).path === 'string') {
      return (value as { path: string }).path;
    }
    return null;
  }

  /**
   * Best-effort mtime read. Returns `fallback` when `file.stat.mtime` is
   * missing or not a number (test mocks, freshly-created files, etc.).
   */
  private readMtime(file: TFile, fallback?: number): number {
    const stat = (file as { stat?: { mtime?: unknown } }).stat;
    const mtime = stat?.mtime;
    if (typeof mtime === 'number' && Number.isFinite(mtime)) return mtime;
    return fallback ?? Date.now();
  }
}

const VAULT_EVENTS = ['create', 'delete', 'rename', 'modify'] as const;
