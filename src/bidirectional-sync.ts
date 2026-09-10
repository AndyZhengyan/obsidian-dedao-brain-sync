import { parseYaml, type App, type TFile } from 'obsidian';
import { createNote, fetchNoteDetail } from './api';
import { updateNote } from './api-clients/openapi-client';
import { createSourceHash, parseSourceBody, SOURCE_BODY_START, SOURCE_BODY_END } from './source-body';
import { renderNote } from './note-parser';
import { getAuthCredentials, getCategoryDir, type GetNoteNote, type Settings, type SyncResult, type SyncResultItem } from './types';
import { t } from './i18n';
import { buildCanonicalCategoryDir } from './date-paths';
import { getFileName } from './sync-paths';

export interface EditableContent { title: string; body: string; tags: string[] }
export interface LocalSyncNote extends EditableContent {
  uid: string; baseline?: string; raw: string; frontmatterEnd: number;
}
interface LocalDraft extends EditableContent { raw: string; frontmatterEnd: number }
function parseDraftFields(text: string): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z0-9_-]+):\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    try { fields[match[1]] = JSON.parse(match[2]); } catch { fields[match[1]] = match[2].replace(/^['"]|['"]$/g, ''); }
  }
  return fields;
}
export type SyncDirection = 'equal' | 'upload' | 'download' | 'conflict';
export type ConflictChoice = 'upload' | 'download' | 'skip';
export interface SyncConflict { path: string; local: EditableContent; remote: EditableContent }
export type ResolveSyncConflict = (conflict: SyncConflict) => Promise<ConflictChoice>;

export function insideSyncFolder(path: string, folder: string): boolean {
  const normalized = folder.replace(/^\/+|\/+$/g, '');
  return !normalized || path.startsWith(`${normalized}/`);
}
export function contentHash(note: EditableContent): string {
  return createSourceHash(note.title, note.tags, note.body);
}
export function syncDirection(local: string, remote: string, baseline?: string): SyncDirection {
  if (local === remote) return 'equal';
  if (!baseline) return 'conflict';
  if (remote === baseline) return 'upload';
  if (local === baseline) return 'download';
  return 'conflict';
}
export function readSyncNote(raw: string, fallbackTitle = ''): LocalSyncNote | null {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!block) return null;
  const fm: unknown = parseYaml(block[1]);
  if (!fm || typeof fm !== 'object') return null;
  const fields = fm as Record<string, unknown>;
  if (typeof fields.uid !== 'string' || !fields.uid) return null;
  if (fields.note_type !== undefined && fields.note_type !== 'plain_text') throw new Error(t('bidirectional.unsupported'));
  const title = fields.title ?? fallbackTitle;
  const tags = fields.tags ?? [];
  if (typeof title !== 'string' || !Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) {
    throw new Error(t('bidirectional.invalid'));
  }
  const source = parseSourceBody(raw.slice(block[0].length));
  if (source.kind === 'invalid' || (source.kind === 'absent' && fields.dedao_sync_schema !== undefined)) throw new Error(t('bidirectional.invalid'));
  return {
    uid: fields.uid, title, tags: tags as string[], body: source.kind === 'valid' ? source.body : raw.slice(block[0].length),
    baseline: typeof fields.dedao_bidirectional_hash === 'string' ? fields.dedao_bidirectional_hash
      : typeof fields.dedao_source_hash === 'string' ? fields.dedao_source_hash : undefined,
    raw, frontmatterEnd: block[0].length,
  };
}

function readLocalDraft(raw: string, fallbackTitle: string): LocalDraft {
  if (!raw.trim()) throw new Error(t('reverseSync.skip.emptyBody'));
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  if (!block && /^---\r?\n/.test(raw)) throw new Error(t('bidirectional.invalid'));
  if (!block) return { title: fallbackTitle, tags: [], body: raw, raw, frontmatterEnd: 0 };
  const fields = parseDraftFields(block[1]);
  if (fields.uid !== undefined || fields.prime_id !== undefined || fields.dedao_sync_schema !== undefined
    || fields.dedao_source_hash !== undefined || fields.dedao_upload_state !== undefined) throw new Error(t('bidirectional.uploadUncertain'));
  if (fields.note_type !== undefined && fields.note_type !== 'plain_text') throw new Error(t('bidirectional.unsupported'));
  const title = typeof fields.title === 'string' && fields.title.trim() ? fields.title : fallbackTitle;
  const tags = fields.tags === undefined ? [] : fields.tags;
  if (!Array.isArray(tags) || tags.some(tag => typeof tag !== 'string')) throw new Error(t('bidirectional.invalid'));
  const body = raw.slice(block[0].length);
  if (!body.trim()) throw new Error(t('bidirectional.invalid'));
  return { title, tags: tags as string[], body, raw, frontmatterEnd: block[0].length };
}

function uploadFields(raw: string, values: Record<string, string>): string {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
  const newline = raw.includes('\r\n') ? '\r\n' : '\n';
  if (!block) {
    return `---${newline}${Object.entries(values).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join(newline)}${newline}---${newline}${raw}`;
  }
  let header = block[0];
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}: ${JSON.stringify(value)}`;
    const pattern = new RegExp(`^${key}:[^\\r\\n]*`, 'm');
    header = pattern.test(header) ? header.replace(pattern, () => line) : header.replace(/---(\r?\n)?$/, () => `${line}${newline}---${newline}`);
  }
  return header + raw.slice(block[0].length);
}

// Replace only managed scalar/list fields and the marked source body. Preserve
// user frontmatter, appendix, links and the file path byte-for-byte.
export function replaceSyncContent(local: LocalSyncNote, next: EditableContent): string {
  if (next.body.includes(SOURCE_BODY_START) || next.body.includes(SOURCE_BODY_END)) throw new Error(t('bidirectional.invalid'));
  let header = local.raw.slice(0, local.frontmatterEnd);
  const newline = header.includes('\r\n') ? '\r\n' : '\n';
  const fields: Record<string, unknown> = {
    title: next.title, tags: next.tags, dedao_source_hash: contentHash(next), dedao_bidirectional_hash: contentHash(next),
  };
  for (const [key, value] of Object.entries(fields)) {
    // Consume an existing block-style YAML list as well as flow/scalar values.
    const pattern = new RegExp(`^${key}:[^\\r\\n]*(?:\\r?\\n(?:[ \\t]+[^\\r\\n]*|-[ \\t]+[^\\r\\n]*))*`, 'm');
    const line = `${key}: ${JSON.stringify(value)}`;
    header = pattern.test(header) ? header.replace(pattern, () => line)
      : header.replace(/---(\r?\n)?$/, () => `${line}${newline}---${newline}`);
  }
  const remainder = local.raw.slice(local.frontmatterEnd);
  if (parseSourceBody(remainder).kind === 'absent') return header + next.body;
  const start = remainder.indexOf(SOURCE_BODY_START) + SOURCE_BODY_START.length;
  const end = remainder.indexOf(SOURCE_BODY_END);
  return header + remainder.slice(0, start) + newline + next.body.replace(/\r\n?/g, '\n').replace(/\n/g, newline) + newline + remainder.slice(end);
}

function remoteContent(note: Partial<GetNoteNote>, uid: string): EditableContent {
  if (typeof note.title !== 'string' || typeof note.content !== 'string' || note.note_type !== 'plain_text' || !Array.isArray(note.tags)) {
    throw new Error(t('bidirectional.unsupported'));
  }
  const id = note.note_id ?? note.id;
  if (id !== undefined && String(id) !== uid) throw new Error(t('bidirectional.invalid'));
  // Compare the same projection that the importer writes (title and tag normalization).
  const projected = readSyncNote(renderNote({ ...note, note_id: uid, id: uid,
    created_at: note.created_at ?? '', updated_at: note.updated_at ?? '', source: note.source ?? '',
  } as GetNoteNote));
  if (!projected) throw new Error(t('bidirectional.invalid'));
  return projected;
}

export class BidirectionalSyncEngine {
  private controller = new AbortController();
  constructor(private app: App, private settings: Settings, private resolve?: ResolveSyncConflict) {}
  cancel(): void { this.controller.abort(); }
  private checkCancelled(): void {
    if (this.controller.signal.aborted) throw new DOMException('Aborted', 'AbortError');
  }
  private uploadTarget(draft: LocalDraft): string {
    const createdAt = new Date().toISOString();
    const note = { note_id: '', id: '', title: draft.title, content: draft.body, tags: draft.tags.map(name => ({ name })),
      note_type: 'plain_text', source: 'app', created_at: createdAt, updated_at: createdAt } as GetNoteNote;
    const category = getCategoryDir(note.note_type);
    const dir = this.settings.datePathEnabled
      ? buildCanonicalCategoryDir(this.settings.folderName, category, createdAt, this.settings.datePathFormat)
      : `${this.settings.folderName}/${category}`;
    return `${dir}/${getFileName(note, this.settings)}.md`;
  }
  private async archive(file: TFile, targetPath: string): Promise<void> {
    if (!insideSyncFolder(targetPath, this.settings.folderName) || targetPath.split('/').some(part => !part || part === '.' || part === '..')
      || targetPath.includes('\\') || !targetPath.endsWith('.md')) throw new Error(t('bidirectional.invalid'));
    if (targetPath !== file.path) {
      if (this.app.vault.getAbstractFileByPath(targetPath)) throw new Error(t('settings.datePath.issue.targetConflict'));
      const dir = targetPath.slice(0, targetPath.lastIndexOf('/'));
      if (!this.app.vault.getAbstractFileByPath(dir)) await this.app.vault.createFolder(dir);
      await this.app.fileManager.renameFile(file, targetPath);
    }
    await this.app.vault.process(file, raw => uploadFields(raw, { dedao_upload_state: 'complete' }));
  }
  async uploadNewFile(file: TFile): Promise<SyncResultItem> {
    const auth = getAuthCredentials(this.settings);
    if (auth.authMode !== 'openapi') throw new Error(t('bidirectional.openApiOnly'));
    const raw = await this.app.vault.read(file);
    const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(raw);
    const fields = block ? parseDraftFields(block[1]) : {};
    if (fields?.dedao_upload_state === 'archive' && typeof fields.uid === 'string' && typeof fields.dedao_upload_target === 'string') {
      await this.archive(file, fields.dedao_upload_target);
      return { noteId: fields.uid, title: file.basename, noteType: 'plain_text', updatedAt: '', status: 'updated' };
    }
    const draft = readLocalDraft(raw, file.basename);
    if (draft.body.includes(SOURCE_BODY_START) || draft.body.includes(SOURCE_BODY_END)) throw new Error(t('bidirectional.invalid'));
    const targetPath = this.uploadTarget(draft).replace(/^\//, '');
    const existing = this.app.vault.getAbstractFileByPath(targetPath);
    if (existing && existing !== file) throw new Error(t('settings.datePath.issue.targetConflict'));
    const hash = contentHash(draft);
    this.checkCancelled();
    // Persist intent before POST. If its outcome is unknown, never blindly repeat
    // a non-idempotent create request, including after a restart.
    const pending = uploadFields(raw, { title: draft.title, dedao_upload_state: 'pending', dedao_upload_target: targetPath });
    await this.app.vault.process(file, current => {
      if (current !== raw) throw new Error(t('bidirectional.changed'));
      return pending;
    });
    const created = await createNote({ token: auth.token, clientId: auth.clientId, authMode: auth.authMode,
      title: draft.title, content: draft.body, noteType: 'plain_text', tags: draft.tags, signal: this.controller.signal });
    // Save identity even after cancellation or concurrent edits. Preserve current
    // text, using the submitted snapshot only as the merge baseline.
    try {
      await this.app.vault.process(file, current => uploadFields(current, {
        uid: created.noteId, note_type: 'plain_text', dedao_source_hash: hash, dedao_bidirectional_hash: hash,
        dedao_upload_state: 'archive', dedao_upload_target: targetPath,
      }));
    } catch {
      throw new Error(t('bidirectional.uploadSaveFailed', { uid: created.noteId }));
    }
    this.checkCancelled();
    await this.archive(file, targetPath);
    return { noteId: created.noteId, title: draft.title, noteType: 'plain_text', updatedAt: '', status: 'created' };
  }
  async sync(selectedIds?: string[]): Promise<SyncResult> {
    const result: SyncResult = { created: 0, updated: 0, skipped: 0, failed: 0, total: 0, items: [] };
    if (!this.settings.reverseSync.enabled) return result;
    const auth = getAuthCredentials(this.settings);
    if (auth.authMode !== 'openapi') throw new Error(t('bidirectional.openApiOnly'));
    const files = this.app.vault.getMarkdownFiles().filter(file => insideSyncFolder(file.path, this.settings.folderName));
    const entries: Array<{ file: TFile; local: LocalSyncNote }> = [];
    const drafts: TFile[] = [];
    const counts = new Map<string, number>();
    for (const file of files) {
      this.checkCancelled();
      try {
        const raw = await this.app.vault.read(file);
        const local = readSyncNote(raw, file.basename);
        if (local && (!selectedIds || selectedIds.includes(local.uid)) && /^dedao_upload_state: "archive"$/m.test(raw)) {
          await this.uploadNewFile(file);
        }
        if (!local) {
          if (selectedIds || file.path.split('/').some(part => part === 'assets' || part === '_original' || part.startsWith('.'))) continue;
          readLocalDraft(raw, file.basename);
          drafts.push(file);
          continue;
        }
        if (selectedIds && !selectedIds.includes(local.uid)) continue;
        entries.push({ file, local: readSyncNote(await this.app.vault.read(file), file.basename)! }); counts.set(local.uid, (counts.get(local.uid) ?? 0) + 1);
      } catch (error) {
        // Unsupported files are visible, but never written through the text API.
        result.skipped++; result.total++;
        result.items!.push({ noteId: file.path, title: file.basename, noteType: '', updatedAt: '', status: 'skipped', error: String(error) });
      }
    }
    for (const file of drafts) {
      this.checkCancelled();
      result.total++;
      const item = await (async (): Promise<SyncResultItem> => {
        try {
          return await this.uploadNewFile(file);
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') throw error;
          return { noteId: file.path, title: file.basename, noteType: 'plain_text', updatedAt: '', status: 'failed', error: error instanceof Error ? error.message : String(error) };
        }
      })();
      result[item.status]++;
      result.items!.push(item);
    }
    for (const { file, local } of entries) {
      this.checkCancelled();
      const item: SyncResultItem = { noteId: local.uid, title: local.title, noteType: 'plain_text', updatedAt: '', status: 'skipped' };
      result.total++;
      try {
        if (counts.get(local.uid) !== 1) throw new Error(t('bidirectional.duplicate'));
        const getRemote = async () => remoteContent(await fetchNoteDetail(local.uid, auth.token, auth.clientId, this.controller.signal, 'openapi'), local.uid);
        const remote = await getRemote();
        let direction: SyncDirection | 'skip' = syncDirection(contentHash(local), contentHash(remote), local.baseline);
        if (direction === 'conflict' && !local.baseline) {
          item.status = 'skipped'; item.error = t('bidirectional.baselineMissing');
          result[item.status]++; result.items!.push(item);
          continue;
        }
        if (direction === 'conflict') direction = this.resolve
          ? await this.resolve({ path: file.path, local, remote }) : 'skip';
        this.checkCancelled();
        if (direction === 'skip') {
          item.status = 'failed'; item.error = t('bidirectional.conflict');
        } else {
          // A preview or HTTP request may outlive edits in either side.
          if (!insideSyncFolder(file.path, this.settings.folderName) || this.app.vault.getAbstractFileByPath(file.path) !== file
            || await this.app.vault.read(file) !== local.raw) throw new Error(t('bidirectional.changed'));
          if (direction !== 'equal' && contentHash(await getRemote()) !== contentHash(remote)) throw new Error(t('bidirectional.changed'));
          this.checkCancelled();
          if (!insideSyncFolder(file.path, this.settings.folderName) || this.app.vault.getAbstractFileByPath(file.path) !== file
            || await this.app.vault.read(file) !== local.raw) throw new Error(t('bidirectional.changed'));
          let next: EditableContent = direction === 'download' ? remote : local;
          if (direction === 'upload') {
            const tagsChanged = createSourceHash('', local.tags, '') !== createSourceHash('', remote.tags, '');
            await updateNote({ token: auth.token, clientId: auth.clientId, id: local.uid, signal: this.controller.signal,
              ...(local.title !== remote.title ? { title: local.title } : {}),
              ...(local.body !== remote.body ? { content: local.body } : {}),
              ...(tagsChanged ? { tags: local.tags } : {}),
            });
            const verified = await getRemote();
            if (contentHash(verified) !== contentHash(local)) throw new Error(t('bidirectional.unconfirmed'));
            next = verified;
          }
          this.checkCancelled();
          const updated = replaceSyncContent(local, next);
          if (updated !== local.raw) await this.app.vault.process(file, current => {
            if (current !== local.raw) throw new Error(t('bidirectional.changed'));
            return updated;
          });
          if (direction !== 'equal') item.status = 'updated';
        }
      } catch (error) {
        this.checkCancelled();
        item.status = 'failed'; item.error = error instanceof Error ? error.message : String(error);
      }
      result[item.status]++; result.items!.push(item);
    }
    return result;
  }
}
