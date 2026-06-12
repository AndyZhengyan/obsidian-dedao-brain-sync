import type { AttachmentImportSettings, AttachmentKind } from '../types';

const EXTENSION_MAP: Record<string, AttachmentKind> = {
  // image
  png: 'image', jpg: 'image', jpeg: 'image', gif: 'image',
  webp: 'image', bmp: 'image', svg: 'image', heic: 'image',
  // audio
  mp3: 'audio', m4a: 'audio', wav: 'audio', aac: 'audio', ogg: 'audio', flac: 'audio',
  // video
  mp4: 'video', mov: 'video', avi: 'video', mkv: 'video', webm: 'video',
  // document
  pdf: 'document', doc: 'document', docx: 'document',
  ppt: 'document', pptx: 'document',
  xls: 'document', xlsx: 'document',
  txt: 'document', md: 'document',
};

/**
 * Classify an attachment URL by its file extension. Returns "other" when the
 * extension is missing or unrecognized.
 *
 * The API's `attachment.type` field is unreliable (it only carries image/audio
 * for some notes) so we always look at the URL. This future-proofs the
 * classifier if the API later starts returning type="video" or "file".
 */
export function classifyAttachmentUrl(url: string): AttachmentKind {
  if (!url) return 'other';
  // Strip query string and hash
  const cleanPath = url.split('?')[0].split('#')[0];
  // Get the last segment, then the extension after the final dot.
  // A path with no extension (e.g. /api/photo) returns "" from match.
  const lastSlash = cleanPath.lastIndexOf('/');
  const filename = lastSlash >= 0 ? cleanPath.slice(lastSlash + 1) : cleanPath;
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0 || lastDot === filename.length - 1) return 'other';
  const ext = filename.slice(lastDot + 1).toLowerCase();
  return EXTENSION_MAP[ext] ?? 'other';
}

/**
 * Returns whether the given attachment kind should be downloaded given the
 * user's per-type settings. "other" (unknown extension) is always enabled —
 * we don't have a setting to gate it, and silently dropping attachments the
 * user didn't explicitly forbid is the principle-of-least-surprise default.
 *
 * Also returns true for any key whose value is undefined in the settings
 * object, so callers that pre-date this feature (or migrated data missing
 * the key) keep working.
 */
export function isAttachmentTypeEnabled(
  settings: AttachmentImportSettings | undefined,
  kind: AttachmentKind
): boolean {
  if (kind === 'other') return true;
  if (!settings) return true;
  // Explicit `false` overrides the default-true behavior
  return settings[kind] !== false;
}
