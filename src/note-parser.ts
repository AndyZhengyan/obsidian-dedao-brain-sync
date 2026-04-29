import type { GetNoteNote } from './types';

/**
 * 解析 ISO 时间字符串为 Obsidian 格式
 * "2026-04-27T22:26:17+08:00" → "2026-04-27 22:26:17"
 */
export function formatDateTime(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return iso;
}

/**
 * 过滤内容中的非法文件名字符
 */
function sanitizeTitle(title: string): string {
  if (!title || !title.trim()) return '';
  return title.replace(/[\\/:*?"<>|]/g, '').trim();
}

/**
 * 生成 frontmatter
 */
function buildFrontmatter(note: GetNoteNote): string {
  const tags = note.tags.map(t => `"${t.name}"`).join(', ');
  const tagBlock = tags ? `[${tags}]` : '[]';

  const title = sanitizeTitle(note.title) ||
    note.content.slice(0, 10).replace(/"/g, '\\"').replace(/\n/g, ' ');

  const lines = [
    '---',
    `uid: "${note.note_id}"`,
    `title: "${title}"`,
    `created: ${formatDateTime(note.created_at)}`,
    `modified: ${formatDateTime(note.updated_at)}`,
    `source: Get笔记`,
    `note_type: ${note.note_type}`,
    `tags: ${tagBlock}`,
    '---',
    '',
  ];

  return lines.join('\n');
}

/**
 * 将 GetNoteNote 渲染为完整的 Markdown 字符串
 */
export function renderNote(note: GetNoteNote): string {
  const frontmatter = buildFrontmatter(note);
  const content = note.content || '';
  return frontmatter + content;
}

/**
 * 从 note.title 生成可读标题（用于日志/通知）
 */
export function getNoteTitle(note: GetNoteNote): string {
  if (note.title && note.title.trim()) {
    return note.title.trim();
  }
  const preview = note.content.slice(0, 10).replace(/\n/g, ' ');
  return preview + (note.content.length > 10 ? '...' : '');
}
