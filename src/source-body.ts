import { createHash } from 'crypto';

export const SOURCE_BODY_START = '<!-- dedao-brain-sync:source-body:start -->';
export const SOURCE_BODY_END = '<!-- dedao-brain-sync:source-body:end -->';

export type SourceBodyParseResult =
  | { kind: 'absent' }
  | { kind: 'valid'; body: string }
  | { kind: 'invalid'; reason: string };

export function normalizeSourceBody(body: string): string {
  return body.replace(/\r\n?/g, '\n');
}

export function renderSourceBody(body: string): string {
  const normalized = normalizeSourceBody(body);
  if (normalized.includes(SOURCE_BODY_START) || normalized.includes(SOURCE_BODY_END)) {
    throw new Error('Source body cannot contain protocol markers');
  }
  return `${SOURCE_BODY_START}\n${normalized}\n${SOURCE_BODY_END}`;
}

export function parseSourceBody(markdown: string): SourceBodyParseResult {
  const normalized = normalizeSourceBody(markdown);
  const starts = [...normalized.matchAll(/<!-- dedao-brain-sync:source-body:start -->/g)];
  const ends = [...normalized.matchAll(/<!-- dedao-brain-sync:source-body:end -->/g)];

  if (starts.length === 0 && ends.length === 0) return { kind: 'absent' };
  if (starts.length !== 1 || ends.length !== 1) {
    return { kind: 'invalid', reason: 'Expected exactly one source-body marker pair' };
  }

  const start = starts[0];
  const end = ends[0];
  const startIndex = start.index ?? -1;
  const endIndex = end.index ?? -1;
  if (startIndex > endIndex) {
    return { kind: 'invalid', reason: 'Source-body markers are reversed' };
  }

  const bodyStart = startIndex + start[0].length;
  const rawBody = normalized.slice(bodyStart, endIndex);
  const body = rawBody.startsWith('\n') ? rawBody.slice(1) : rawBody;
  return { kind: 'valid', body: body.endsWith('\n') ? body.slice(0, -1) : body };
}

export function createSourceHash(title: string, tags: string[], body: string): string {
  const canonical = JSON.stringify({
    title,
    tags: [...new Set(tags)].sort(),
    body: normalizeSourceBody(body),
  });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}
