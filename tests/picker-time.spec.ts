import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { initI18n } from '../src/i18n';
import { formatPickerRelativeTime } from '../src/ui/picker-time';

describe('formatPickerRelativeTime', () => {
  beforeEach(() => {
    initI18n('zh');
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-03T12:00:00+08:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('formats same-day timestamps as local hour and minute', () => {
    const timestamp = '2026-06-03T10:05:00+08:00';
    const expected = new Date(timestamp).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
    });

    expect(formatPickerRelativeTime(timestamp)).toBe(expected);
  });

  it('formats yesterday with the picker translation', () => {
    expect(formatPickerRelativeTime('2026-06-02T12:00:00+08:00')).toBe('昨天');
  });

  it('formats older timestamps as a day count', () => {
    expect(formatPickerRelativeTime('2026-05-31T12:00:00+08:00')).toBe('3天前');
  });

  it('keeps empty timestamps blank for preview rows without update time', () => {
    expect(formatPickerRelativeTime('')).toBe('');
  });
});
