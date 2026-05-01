import { App, TFile } from 'obsidian';
import { fetchAllNotes } from './api';
import { renderNote, formatDateTime, generateDisplayTitle, formatTimestampPrefix } from './note-parser';
import { getCategoryDir } from './types';
import type { GetNoteNote, Settings, SyncResult } from './types';
import type { SyncModal } from './ui/sync-modal';
import { t } from './i18n';

export class SyncCancelledError extends Error {
  constructor() {
    super('Sync cancelled');
    this.name = 'SyncCancelledError';
  }
}

export interface SyncProgressCallback {
  (info: { page?: number; processed?: number; total?: number; created?: number; updated?: number; skipped?: number; failed?: number; percent?: number }): void;
}

export class SyncEngine {
  private app: App;
  private settings: Settings;
  private onProgress?: SyncProgressCallback;
  private cancelled = false;

  constructor(app: App, settings: Settings, onProgress?: SyncProgressCallback) {
    this.app = app;
    this.settings = settings;
    this.onProgress = onProgress;
  }

  private async ensureCategoryDir(categoryDir: string): Promise<string> {
    const basePath = this.settings.folderName;
    const fullPath = `${basePath}/${categoryDir}`;
    const targetDir = this.app.vault.getAbstractFileByPath(fullPath);
    if (!targetDir) {
      await this.app.vault.createFolder(fullPath);
    }
    return fullPath;
  }

  private getFileName(note: GetNoteNote): string {
    const rawTitle = generateDisplayTitle(note);
    const displayTitle = rawTitle || t('picker.noTitle');
    if (this.settings.filenamePrefix) {
      const stamp = formatTimestampPrefix(this.settings.filenamePrefix, note.created_at);
      if (stamp) {
        return `${stamp}_${displayTitle}`;
      }
    }
    return displayTitle;
  }

  private getFilePath(categoryDir: string, note: GetNoteNote): string {
    return `${categoryDir}/${this.getFileName(note)}.md`;
  }

  private resolveConflict(categoryDir: string, baseName: string): string {
    let suffix = 2;
    let path: string;
    do {
      path = `${categoryDir}/${baseName}-${suffix}.md`;
      suffix++;
    } while (this.app.vault.getAbstractFileByPath(path));
    return path;
  }

  cancel(): void {
    this.cancelled = true;
  }

  private async isContentChanged(file: TFile, note: GetNoteNote): Promise<boolean> {
    try {
      const cached = this.app.metadataCache.getFileCache(file);
      if (!cached?.frontmatter) return true;
      const modified = cached.frontmatter['modified'] as string | undefined;
      if (!modified) return true;
      const noteModified = formatDateTime(note.updated_at);
      return modified !== noteModified;
    } catch {
      return true;
    }
  }

  private buildUidIndex(): Map<string, TFile> {
    const index = new Map<string, TFile>();
    const prefix = this.settings.folderName + '/';
    const allFiles = this.app.vault.getMarkdownFiles();
    for (const file of allFiles) {
      if (!file.path.startsWith(prefix)) continue;
      const cached = this.app.metadataCache.getFileCache(file);
      const uid = cached?.frontmatter?.['uid'] as string | undefined;
      if (uid) {
        index.set(uid, file);
      }
    }
    return index;
  }

  private async writeNote(
    note: GetNoteNote,
    uidIndex: Map<string, TFile>
  ): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
    try {
      const categoryDir = await this.ensureCategoryDir(getCategoryDir(note.note_type));
      let targetPath = this.getFilePath(categoryDir, note);
      const existingByUid = uidIndex.get(note.note_id);
      const existingAtTarget = this.app.vault.getAbstractFileByPath(targetPath);

      if (existingAtTarget && existingAtTarget instanceof TFile) {
        if (!existingByUid || existingAtTarget.path !== existingByUid.path) {
          const cached = this.app.metadataCache.getFileCache(existingAtTarget);
          const targetUid = cached?.frontmatter?.['uid'] as string | undefined;
          if (targetUid && targetUid !== note.note_id) {
            const baseName = this.getFileName(note);
            targetPath = this.resolveConflict(categoryDir, baseName);
          }
        }
      }

      if (existingByUid) {
        const contentChanged = await this.isContentChanged(existingByUid, note);
        const pathChanged = existingByUid.path !== targetPath;

        if (!contentChanged && !pathChanged) return 'skipped';

        const content = renderNote(note);
        if (pathChanged) {
          await this.app.vault.rename(existingByUid, targetPath);
        }
        await this.app.vault.modify(existingByUid, content);
        return 'updated';
      } else {
        const content = renderNote(note);
        await this.app.vault.create(targetPath, content);
        const created = this.app.vault.getAbstractFileByPath(targetPath);
        if (created && created instanceof TFile) {
          uidIndex.set(note.note_id, created);
        }
        return 'created';
      }
    } catch (err) {
      console.error(`[GetNote] Write failed [${generateDisplayTitle(note) || note.note_id}]:`, err);
      return 'failed';
    }
  }

  private filterRecentNotes(notes: GetNoteNote[]): GetNoteNote[] {
    if (this.settings.maxDays <= 0) return notes;
    const cutoff = Date.now() - this.settings.maxDays * 24 * 60 * 60 * 1000;
    return notes.filter(note => {
      const updated = new Date(note.updated_at).getTime();
      return updated >= cutoff;
    });
  }

  async sync(modal?: SyncModal): Promise<SyncResult> {
    const result: SyncResult = { created: 0, updated: 0, skipped: 0, failed: 0, total: 0 };
    const uidIndex = this.buildUidIndex();
    const controller = new AbortController();
    let pageCount = 0;

    const cleanup = () => {
      this.cancelled = true;
      if (!controller.signal.aborted) controller.abort();
    };
    modal?.setOnCancel(cleanup);

    try {
      for await (const notes of fetchAllNotes(this.settings.apiToken, this.settings.clientId, controller.signal)) {
        if (this.cancelled || modal?.isCancelled()) throw new SyncCancelledError();
        pageCount++;
        this.onProgress?.({ page: pageCount, percent: 0 });

        const filtered = this.filterRecentNotes(notes);

        for (const note of filtered) {
          if (modal?.isCancelled()) throw new SyncCancelledError();

          result.total++;
          const status = await this.writeNote(note, uidIndex);

          switch (status) {
            case 'created': result.created++; break;
            case 'updated': result.updated++; break;
            case 'skipped': result.skipped++; break;
            case 'failed': result.failed++; break;
          }

          if (result.total % 10 === 0) {
            this.onProgress?.({
              page: pageCount,
              processed: result.total,
              total: result.total,
              created: result.created,
              updated: result.updated,
              skipped: result.skipped,
              failed: result.failed,
              percent: 0,
            });
          }
        }
      }

      this.onProgress?.({ percent: 100 });
      return result;
    } catch (err) {
      cleanup();
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new SyncCancelledError();
      }
      throw err;
    }
  }

  async syncNoteIds(
    noteIds: string[],
    modal?: SyncModal
  ): Promise<SyncResult> {
    const result: SyncResult = { created: 0, updated: 0, skipped: 0, failed: 0, total: 0 };
    const idSet = new Set(noteIds);
    const uidIndex = this.buildUidIndex();
    const controller = new AbortController();
    let fetchedCount = 0;

    const cleanup = () => {
      if (!controller.signal.aborted) controller.abort();
    };
    modal?.setOnCancel(cleanup);

    try {
      for await (const batch of fetchAllNotes(this.settings.apiToken, this.settings.clientId, controller.signal)) {
        if (modal?.isCancelled()) throw new SyncCancelledError();

        const matched = batch.filter(n => idSet.has(n.note_id));

        for (const note of matched) {
          if (modal?.isCancelled()) throw new SyncCancelledError();

          fetchedCount++;
          const percent = Math.round((fetchedCount / noteIds.length) * 100);
          this.onProgress?.({
            processed: fetchedCount,
            total: noteIds.length,
            percent,
          });
          const status = await this.writeNote(note, uidIndex);
          switch (status) {
            case 'created': result.created++; break;
            case 'updated': result.updated++; break;
            case 'skipped': result.skipped++; break;
            case 'failed': result.failed++; break;
          }
        }

        if (fetchedCount >= noteIds.length) break;
      }

      this.onProgress?.({ percent: 100 });
      return result;
    } catch (err) {
      cleanup();
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new SyncCancelledError();
      }
      throw err;
    }
  }
}
