import type { App, TFile } from 'obsidian';
import { createNote, fetchNoteDetail } from './api';
import { getAuthCredentials, type AuthCredentials, type Settings } from './types';

export interface ReverseSyncResult {
  created: number;
  skipped: number;
  failed: number;
  total: number;
}

interface LocalMarkdownNote {
  file: TFile;
  content: string;
  frontmatter: Record<string, unknown>;
  body: string;
  uid?: string;
  title: string;
  noteType: string;
  tags: string[];
}

const SUPPORTED_NOTE_TYPES = new Set(['plain_text', 'link']);

function splitMarkdown(content: string): { frontmatterRaw: string | null; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) return { frontmatterRaw: null, body: content };
  return {
    frontmatterRaw: match[1],
    body: content.slice(match[0].length),
  };
}

function stripQuotes(value: string): string {
  return value.trim().replace(/^"|"$/g, '');
}

function readString(frontmatter: Record<string, unknown>, key: string): string {
  const value = frontmatter[key];
  return typeof value === 'string' ? value.trim() : '';
}

function readTags(frontmatter: Record<string, unknown>): string[] {
  const value = frontmatter.tags;
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value !== 'string') return [];
  const trimmed = value.trim();
  if (!trimmed || trimmed === '[]') return [];
  return trimmed
    .replace(/^\[|\]$/g, '')
    .split(',')
    .map(stripQuotes)
    .filter(Boolean);
}

function fileBasename(file: TFile): string {
  return file.basename || file.path.split('/').pop()?.replace(/\.md$/i, '') || 'Untitled';
}

function replaceOrInsertUid(content: string, uid: string): string {
  const uidLine = `uid: "${uid}"`;
  const match = content.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!match) {
    return ['---', uidLine, '---', content].join('\n');
  }
  const frontmatterLines = match[1].split('\n');
  const uidIndex = frontmatterLines.findIndex(line => /^\s*uid\s*:/.test(line));
  if (uidIndex >= 0) {
    frontmatterLines[uidIndex] = uidLine;
  } else {
    frontmatterLines.unshift(uidLine);
  }
  return `---\n${frontmatterLines.join('\n')}\n---\n${content.slice(match[0].length)}`;
}

function isMissingRemoteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /不存在|not\s*found|not\s*exist|404/i.test(message);
}

function isInsideFolder(file: TFile, folderName: string): boolean {
  const folder = folderName.replace(/^\/+|\/+$/g, '');
  if (!folder) return true;
  return file.path === `${folder}.md` || file.path.startsWith(`${folder}/`);
}

export class ReverseSyncEngine {
  constructor(private app: App, private settings: Settings) {}

  private requireCredentials(): AuthCredentials {
    const credentials = getAuthCredentials(this.settings);
    if (!credentials.token || (credentials.authMode !== 'web' && !credentials.clientId)) {
      throw new Error('Missing GetNote credentials');
    }
    return credentials;
  }

  private async readLocalNote(file: TFile): Promise<LocalMarkdownNote | null> {
    const content = await this.app.vault.read(file);
    const cache = this.app.metadataCache.getFileCache(file);
    const frontmatter = cache?.frontmatter ?? {};
    const { body } = splitMarkdown(content);
    const noteType = readString(frontmatter, 'note_type') || 'plain_text';
    if (!SUPPORTED_NOTE_TYPES.has(noteType)) return null;
    if (!body.trim()) return null;

    return {
      file,
      content,
      frontmatter,
      body,
      uid: readString(frontmatter, 'uid') || undefined,
      title: readString(frontmatter, 'title') || fileBasename(file),
      noteType,
      tags: readTags(frontmatter),
    };
  }

  private async remoteExists(uid: string, credentials: AuthCredentials): Promise<boolean> {
    try {
      await fetchNoteDetail(uid, credentials.token, credentials.clientId, undefined, credentials.authMode);
      return true;
    } catch (err) {
      if (isMissingRemoteError(err)) return false;
      throw err;
    }
  }

  private async createRemoteNote(note: LocalMarkdownNote, credentials: AuthCredentials): Promise<void> {
    const created = await createNote({
      token: credentials.token,
      clientId: credentials.clientId,
      authMode: credentials.authMode,
      title: note.title,
      content: note.body,
      noteType: note.noteType,
      tags: note.tags,
    });
    await this.app.vault.modify(note.file, replaceOrInsertUid(note.content, created.noteId));
  }

  async syncFiles(files: TFile[]): Promise<ReverseSyncResult> {
    const credentials = this.requireCredentials();
    const result: ReverseSyncResult = { created: 0, skipped: 0, failed: 0, total: 0 };

    for (const file of files) {
      const note = await this.readLocalNote(file);
      if (!note) continue;
      result.total++;

      try {
        if (note.uid && await this.remoteExists(note.uid, credentials)) {
          result.skipped++;
          continue;
        }
        await this.createRemoteNote(note, credentials);
        result.created++;
      } catch (err) {
        console.error(`[GetNote] Reverse sync failed [${file.path}]:`, err);
        result.failed++;
      }
    }

    return result;
  }

  async syncBack(): Promise<ReverseSyncResult> {
    const files = this.app.vault.getMarkdownFiles().filter(item => isInsideFolder(item, this.settings.folderName));
    return this.syncFiles(files);
  }
}
