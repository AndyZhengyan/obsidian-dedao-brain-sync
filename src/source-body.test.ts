import { describe, expect, it } from 'vitest';
import {
  createSourceHash,
  normalizeSourceBody,
  parseSourceBody,
  renderSourceBody,
} from './source-body';

describe('source body protocol', () => {
  it('round-trips leading and trailing blank lines after LF normalization', () => {
    const body = '\r\n# title\r\n\r\ncontent\r\n\r\n';
    const rendered = renderSourceBody(body);

    expect(parseSourceBody(rendered)).toEqual({
      kind: 'valid',
      body: '\n# title\n\ncontent\n\n',
    });
  });

  it('reports an absent marker pair without treating it as invalid', () => {
    expect(parseSourceBody('plain legacy body')).toEqual({ kind: 'absent' });
  });

  it('rejects duplicate and reversed marker pairs', () => {
    expect(parseSourceBody([
      '<!-- dedao-brain-sync:source-body:start -->', 'one',
      '<!-- dedao-brain-sync:source-body:end -->',
      '<!-- dedao-brain-sync:source-body:start -->', 'two',
      '<!-- dedao-brain-sync:source-body:end -->',
    ].join('\n'))).toMatchObject({ kind: 'invalid' });
    expect(parseSourceBody([
      '<!-- dedao-brain-sync:source-body:end -->',
      '<!-- dedao-brain-sync:source-body:start -->',
    ].join('\n'))).toMatchObject({ kind: 'invalid' });
  });

  it('rejects source text that contains a protocol marker', () => {
    expect(() => renderSourceBody('text\n<!-- dedao-brain-sync:source-body:start -->')).toThrow(/marker/i);
  });

  it('uses a stable SHA-256 fingerprint over canonical visible fields', () => {
    expect(normalizeSourceBody('A\r\nB')).toBe('A\nB');
    expect(createSourceHash('Title', ['z', 'a', 'z'], 'Body')).toBe(
      'sha256:3dbb98e7206ceb1c4e60f0951411b9d6b175ce62d89951b23535be49bd02e8be'
    );
  });
});
