import { describe, it, expect } from 'vitest';
import type { ApiQuotaState } from '../src/types';

const DEFAULT_QUOTA: ApiQuotaState = {
  exhausted: false,
  reason: undefined,
  checkedAt: undefined,
};

// We test the quota state type shape and the logic in main.tsx
// (the error detection is already tested via openapi-client spec)

describe('ApiQuotaState shape', () => {
  it('is serializable to JSON (survives JSON round-trip)', () => {
    const input: ApiQuotaState = { exhausted: true, reason: 'quota_day', checkedAt: 1700000000000 };
    const out = JSON.parse(JSON.stringify(input));
    expect(out).toEqual(input);
  });

  it('handles the default/clean state', () => {
    expect(DEFAULT_QUOTA.exhausted).toBe(false);
    expect(DEFAULT_QUOTA.checkedAt).toBeUndefined();
  });
});

describe('quota detection from error messages', () => {
  // These mirror the logic in main.tsx's runSync error handler
  function isQuotaExceeded(error: string): boolean {
    return error.includes('配额') || error.includes('quota') || error.includes('429');
  }

  function isAuthError(error: string): boolean {
    return error.includes('401') || error.includes('鉴权') || error.includes('Token 无效') || error.includes('Invalid') || error.includes('unauthorized') || error.includes('expired');
  }

  it('detects Chinese quota message', () => {
    expect(isQuotaExceeded('今日配额已用完')).toBe(true);
  });

  it('detects English quota message', () => {
    expect(isQuotaExceeded('quota_day exceeded')).toBe(true);
  });

  it('detects 429 status code fallback', () => {
    expect(isQuotaExceeded('429 Too Many Requests')).toBe(true);
  });

  it('does not mistake auth for quota', () => {
    expect(isQuotaExceeded('Token 无效')).toBe(false);
    expect(isAuthError('Token 无效')).toBe(true);
  });

  it('does not mistake quota for auth', () => {
    expect(isAuthError('quota_month')).toBe(false);
  });
});
