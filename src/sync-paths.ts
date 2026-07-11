import { t } from './i18n';
import { generateDisplayTitle, formatTimestampPrefix } from './note-parser';
import type { GetNoteNote, Settings } from './types';

export function getKnowledgeBaseDir(name: string): string {
  const safeName = name.replace(/[\\/:*?"<>|]/g, '_').trim() || t('picker.noTitle');
  return `知识库/${safeName}`;
}

export function buildNoteBaseName(note: GetNoteNote, settings: Pick<Settings, 'filenamePrefix'>): string {
  const rawTitle = generateDisplayTitle(note);
  const displayTitle = rawTitle || t('picker.noTitle');
  const prefix = settings.filenamePrefix?.trim();
  if (!prefix) return displayTitle;

  const hasTimestampTokens = /YYYY|MM|DD|HH|mm|ss/.test(prefix);
  if (hasTimestampTokens) {
    const formattedPrefix = formatTimestampPrefix(prefix, note.created_at);
    if (!formattedPrefix) {
      return displayTitle;
    }
    const separator = formattedPrefix.endsWith('_') ? '' : '_';
    return `${formattedPrefix}${separator}${displayTitle}`;
  }

  const separator = prefix.endsWith('_') ? '' : '_';
  return `${prefix}${separator}${displayTitle}`;
}

export function getFileName(note: GetNoteNote, settings: Pick<Settings, 'filenamePrefix'>, parentBaseName?: string): string {
  if (parentBaseName) {
    const childTitle = generateDisplayTitle(note) || t('picker.noTitle');
    return `${parentBaseName}__${childTitle}`;
  }
  return buildNoteBaseName(note, settings);
}

export function getAudioAssetBaseName(note: GetNoteNote, settings: Pick<Settings, 'filenamePrefix'>): string {
  const safeNoteId = note.note_id.replace(/[\\/:*?"<>|]/g, '_');
  return `${getFileName(note, settings)}_${safeNoteId}`;
}

export function getFilePath(categoryDir: string, note: GetNoteNote, settings: Pick<Settings, 'filenamePrefix'>): string {
  return `${categoryDir}/${getFileName(note, settings)}.md`;
}
