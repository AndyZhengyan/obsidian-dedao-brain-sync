import { describe, expect, it } from 'vitest';
import { isRecord, normalizeBearerToken, parseJsonObjectOrEmpty, parseJsonPreservingIds } from '../src/api-clients/api-client-utils';

describe('api client shared transport primitives', () => {
  it('parses GetNote numeric identifiers as strings without losing precision', () => {
    const result = parseJsonPreservingIds(
      '{"id":9007199254740999,"note_id":123456789012345678,"prime_id":1909246675068292528,"post_id_alias":1908043831896764336,"children_ids":[1909246675068292528,42]}'
    ) as Record<string, unknown>;

    expect(result.id).toBe('9007199254740999');
    expect(result.note_id).toBe('123456789012345678');
    expect(result.prime_id).toBe('1909246675068292528');
    expect(result.post_id_alias).toBe('1908043831896764336');
    expect(result.children_ids).toEqual(['1909246675068292528', 42]);
  });

  it('returns an empty object for invalid or non-object error bodies', () => {
    expect(parseJsonObjectOrEmpty('not json')).toEqual({});
    expect(parseJsonObjectOrEmpty('[]')).toEqual({});
    expect(parseJsonObjectOrEmpty('{"reason":"quota_day"}')).toEqual({ reason: 'quota_day' });
  });

  it('shares record and bearer-token normalization helpers without policy semantics', () => {
    expect(isRecord({ ok: true })).toBe(true);
    expect(isRecord([])).toBe(false);
    expect(normalizeBearerToken('abc')).toBe('Bearer abc');
    expect(normalizeBearerToken('Bearer abc')).toBe('Bearer abc');
  });
});
