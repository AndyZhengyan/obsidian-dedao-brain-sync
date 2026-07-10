function stripMarkdownSyntax(value: string): string {
  return value
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/^\s*\|?[-:|\s]{3,}\|?\s*$/gm, ' ')
    .replace(/\|/g, ' ')
    .replace(/[*_~]{1,3}/g, '')
    .replace(/<[^>]+>/g, ' ');
}

export function compactCardPreviewText(value: string | undefined, maxLength = 150): string {
  const compacted = stripMarkdownSyntax(value ?? '')
    .replace(/\s+/g, ' ')
    .trim();
  return compacted.slice(0, maxLength);
}
