import { describe, expect, it } from 'vitest';
import { getLocalDateInputValue } from './date-input';

describe('getLocalDateInputValue', () => {
  it('formats the calendar date using local date parts', () => {
    expect(getLocalDateInputValue(new Date(2026, 0, 2, 0, 30))).toBe('2026-01-02');
    expect(getLocalDateInputValue(new Date(2026, 11, 31, 23, 30))).toBe('2026-12-31');
  });
});
