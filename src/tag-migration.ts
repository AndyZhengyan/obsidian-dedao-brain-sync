import type { TFile, Vault } from 'obsidian';

const SYNCED_NOTE_SOURCES = new Set(['得到大脑', 'Get笔记']);
const FRONTMATTER_PATTERN = /^---\r?\n([\s\S]*?)\r?\n---(?=\r?\n|$)/;

type TagMigrationVault = Pick<Vault, 'getMarkdownFiles' | 'read' | 'modify'>;

export interface TagMigrationResult {
  scanned: number;
  updated: number;
}

function normalizeFrontmatterTags(content: string): string | null {
  const frontmatterMatch = FRONTMATTER_PATTERN.exec(content);
  if (!frontmatterMatch) return null;

  const frontmatter = frontmatterMatch[1];
  const sourceMatch = /^source:\s*(.+?)\s*$/m.exec(frontmatter);
  if (!sourceMatch || !SYNCED_NOTE_SOURCES.has(sourceMatch[1])) return null;

  const normalizedFrontmatter = frontmatter.replace(/^tags:\s*\[(.*)\]\s*$/m, (line, values: string) => {
    const normalized = values.replace(/"([^"]*)"/g, (_tag, value: string) => `"${value.trim().replace(/\s+/g, '-')}"`);
    return normalized === values ? line : `tags: [${normalized}]`;
  });

  if (normalizedFrontmatter === frontmatter) return null;
  return content.slice(0, frontmatterMatch.index) +
    frontmatterMatch[0].replace(frontmatter, normalizedFrontmatter) +
    content.slice(frontmatterMatch.index + frontmatterMatch[0].length);
}

export async function migrateSyncedNoteTags(vault: TagMigrationVault, folderName: string): Promise<TagMigrationResult> {
  const prefix = `${folderName.replace(/\/+$/, '')}/`;
  const files = vault.getMarkdownFiles().filter((file: TFile) => file.path.startsWith(prefix));
  let updated = 0;

  for (const file of files) {
    const content = await vault.read(file);
    const migrated = normalizeFrontmatterTags(content);
    if (migrated === null) continue;
    await vault.modify(file, migrated);
    updated++;
  }

  return { scanned: files.length, updated };
}
