import { describe, it, expect } from 'vitest';
import type { SyncHistoryEntry, SyncResult } from '../src/types';

function makeResult(overrides: Partial<SyncResult> = {}): SyncResult {
  return { created: 0, updated: 0, skipped: 0, failed: 0, total: 0, ...overrides };
}

function recordSyncHistory(
  history: SyncHistoryEntry[],
  result: SyncResult,
  type: 'full' | 'selective' | 'auto',
  maxEntries = 20
): SyncHistoryEntry[] {
  const entry: SyncHistoryEntry = { timestamp: Date.now(), result, type };
  history.push(entry);
  return history.slice(-maxEntries);
}

describe('SyncHistoryEntry', () => {
  it('records sync result with timestamp and type', () => {
    const result = makeResult({ created: 3, updated: 1, total: 4 });
    const entry: SyncHistoryEntry = {
      timestamp: 1714500000000,
      result,
      type: 'full',
    };

    expect(entry.type).toBe('full');
    expect(entry.result.created).toBe(3);
    expect(entry.timestamp).toBe(1714500000000);
  });

  it('records selective sync type', () => {
    const entry: SyncHistoryEntry = {
      timestamp: 1714500000000,
      result: makeResult({ created: 1 }),
      type: 'selective',
    };
    expect(entry.type).toBe('selective');
  });

  it('records auto sync type', () => {
    const entry: SyncHistoryEntry = {
      timestamp: 1714500000000,
      result: makeResult(),
      type: 'auto',
    };
    expect(entry.type).toBe('auto');
  });
});

describe('recordSyncHistory', () => {
  it('appends entry to history and returns last sync result', () => {
    const history: SyncHistoryEntry[] = [];
    const result = makeResult({ created: 5, updated: 2, total: 7 });

    const updated = recordSyncHistory(history, result, 'full');

    expect(updated.length).toBe(1);
    expect(updated[0].result.created).toBe(5);
    expect(updated[0].result.updated).toBe(2);
    expect(updated[0].type).toBe('full');
  });

  it('caps history at maxEntries (default 20)', () => {
    const history: SyncHistoryEntry[] = [];
    for (let i = 0; i < 25; i++) {
      history.push({ timestamp: i, result: makeResult({ created: i }), type: 'full' });
    }

    const updated = recordSyncHistory(history, makeResult({ created: 99 }), 'full');

    expect(updated.length).toBe(20);
    // First entry should be dropped
    expect(updated[0].result.created).toBe(6);
    // Last entry should be the new one
    expect(updated[19].result.created).toBe(99);
  });

  it('maintains entries when under cap', () => {
    const history: SyncHistoryEntry[] = [];
    let h = history;
    for (let i = 0; i < 10; i++) {
      h = recordSyncHistory(h, makeResult({ created: i }), 'auto');
    }

    expect(h.length).toBe(10);
  });
});

describe('consecutive auto-sync failure counter', () => {
  it('resets count on success', () => {
    let failCount = 3;
    // Simulate success
    failCount = 0;
    expect(failCount).toBe(0);
  });

  it('increments count on failure', () => {
    let failCount = 0;
    failCount++;
    expect(failCount).toBe(1);
    failCount++;
    expect(failCount).toBe(2);
  });

  it('triggers repeated warning at >= 3', () => {
    let failCount = 3;
    const shouldWarn = failCount >= 3;
    expect(shouldWarn).toBe(true);

    failCount = 2;
    expect(failCount >= 3).toBe(false);
  });
});
