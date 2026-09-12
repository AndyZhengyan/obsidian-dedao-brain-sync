import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AutoUploadScheduler } from '../src/auto-upload';

const realtime = { enabled: true, mode: 'realtime' as const, intervalMinutes: 2 };

function setup() {
  const run = vi.fn< (paths?: string[]) => Promise<void> >().mockResolvedValue(undefined);
  const isBusy = vi.fn(() => false);
  const onError = vi.fn();
  const scheduler = new AutoUploadScheduler({ run, isBusy, onError });
  return { scheduler, run, isBusy, onError };
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

describe('AutoUploadScheduler', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('scans offline changes on enabling realtime and debounces subsequent edits', async () => {
    const { scheduler, run } = setup();
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenNthCalledWith(1, undefined);
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(3_000);
    scheduler.notify('one.md');
    scheduler.notify('two.md');
    await vi.advanceTimersByTimeAsync(4_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenNthCalledWith(2, ['one.md', 'two.md']);
    scheduler.dispose();
  });

  it('does not reset a pending debounce when unchanged settings are saved', async () => {
    const { scheduler, run } = setup();
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(4_000);
    scheduler.configure({ ...realtime });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.dispose();
  });

  it('interval mode waits the configured duration, ignores notifications, and repeats full scans', async () => {
    const { scheduler, run } = setup();
    scheduler.configure({ ...realtime, mode: 'interval' });
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(119_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenNthCalledWith(1, undefined);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenNthCalledWith(2, undefined);
    scheduler.dispose();
  });

  it('switches mode and cancels pending work when disabled or disposed', async () => {
    const { scheduler, run } = setup();
    scheduler.configure(realtime);
    scheduler.configure({ ...realtime, mode: 'interval' });
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).not.toHaveBeenCalled();
    scheduler.configure({ ...realtime, enabled: false });
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).not.toHaveBeenCalled();
    scheduler.configure(realtime);
    scheduler.dispose();
    scheduler.configure(realtime);
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).not.toHaveBeenCalled();
  });

  it('defers while the sync engine is busy without discarding edits', async () => {
    const { scheduler, run, isBusy } = setup();
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(5_000);
    isBusy.mockReturnValue(true);
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(1);
    scheduler.notify('two.md');
    isBusy.mockReturnValue(false);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenNthCalledWith(2, ['one.md', 'two.md']);
    scheduler.dispose();
  });

  it('preserves edits during an in-flight upload without overlapping uploads', async () => {
    const { scheduler, run } = setup();
    const pending = deferred();
    run.mockReturnValueOnce(pending.promise);
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(5_000);
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(15_000);
    expect(run).toHaveBeenCalledTimes(1);
    pending.resolve();
    await vi.advanceTimersByTimeAsync(5_000);
    expect(run).toHaveBeenNthCalledWith(2, ['one.md']);
    scheduler.dispose();
  });

  it('honors new configuration while an older upload is still finishing', async () => {
    const { scheduler, run } = setup();
    const pending = deferred();
    run.mockReturnValueOnce(pending.promise);
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(5_000);
    scheduler.configure({ ...realtime, mode: 'interval' });
    pending.resolve();
    await vi.advanceTimersByTimeAsync(119_999);
    expect(run).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenNthCalledWith(2, undefined);
    scheduler.dispose();
  });

  it('retries failures after a minute and notifications cannot create a hot retry loop', async () => {
    const { scheduler, run, onError } = setup();
    const error = new Error('offline');
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(5_000);
    run.mockRejectedValueOnce(error);
    scheduler.notify('one.md');
    await vi.advanceTimersByTimeAsync(5_000);
    expect(onError).toHaveBeenCalledWith(error);
    scheduler.notify('two.md');
    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenNthCalledWith(3, ['one.md', 'two.md']);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(3);
    scheduler.dispose();
  });

  it('does not schedule another run when disposed during an upload', async () => {
    const { scheduler, run } = setup();
    const pending = deferred();
    run.mockReturnValueOnce(pending.promise);
    scheduler.configure(realtime);
    await vi.advanceTimersByTimeAsync(5_000);
    scheduler.notify('one.md');
    scheduler.dispose();
    pending.resolve();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
