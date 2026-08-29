import { describe, expect, it, vi } from 'vitest';
import { WebTokenRefreshCoordinator } from '../src/web-token-refresh';

describe('WebTokenRefreshCoordinator', () => {
  it('shares one hidden session-reuse capture, then persists the validated replacement token', async () => {
    const validate = vi.fn().mockResolvedValue(undefined);
    const persist = vi.fn().mockResolvedValue(undefined);
    const captureToken = vi.fn(async (captureValidate: (token: string) => Promise<void>) => {
      await captureValidate('Bearer renewed-token');
      return 'Bearer renewed-token';
    });
    const coordinator = new WebTokenRefreshCoordinator({
      captureToken,
      validate,
      persist,
      notifyFailure: vi.fn(),
    });

    const [first, second] = await Promise.all([coordinator.refresh(), coordinator.refresh()]);

    expect(first).toBe('Bearer renewed-token');
    expect(second).toBe('Bearer renewed-token');
    expect(captureToken).toHaveBeenCalledOnce();
    expect(captureToken).toHaveBeenCalledWith(expect.any(Function), { interactive: false });
    expect(validate).toHaveBeenCalledWith('Bearer renewed-token');
    expect(persist).toHaveBeenCalledWith('Bearer renewed-token');
  });

  it('shows the expired-session notice once when hidden renewal cannot obtain a token', async () => {
    const notifyFailure = vi.fn();
    const coordinator = new WebTokenRefreshCoordinator({
      captureToken: vi.fn().mockRejectedValue(new Error('timed out')),
      validate: vi.fn(),
      persist: vi.fn(),
      notifyFailure,
    });

    await expect(coordinator.refresh()).rejects.toThrow('timed out');
    await expect(coordinator.refresh()).rejects.toThrow('timed out');

    expect(notifyFailure).toHaveBeenCalledOnce();
  });
});
