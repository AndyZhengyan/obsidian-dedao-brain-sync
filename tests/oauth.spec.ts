import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOAuthDeviceCode, pollOAuthToken } from '../src/api';

const BASE_URL = 'https://openapi.biji.com/open/api/v1';

describe('fetchOAuthDeviceCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /oauth/device/code with correct body', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          verification_uri: 'https://biji.com/verify',
          user_code: 'ABCD-1234',
          code: 'dev_abc',
          interval: 5,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await fetchOAuthDeviceCode();

    expect(mockFetch).toHaveBeenCalledWith(
      `${BASE_URL}/oauth/device/code`,
      expect.objectContaining({
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id: 'cli_a1b2c3d4e5f6789012345678abcdef90' }),
      })
    );
    expect(result).toEqual({
      verification_uri: 'https://biji.com/verify',
      user_code: 'ABCD-1234',
      code: 'dev_abc',
      interval: 5,
    });
  });

  it('throws when success=false from API', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ success: false, message: 'invalid client' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchOAuthDeviceCode()).rejects.toThrow('invalid client');
  });

  it('throws on non-ok response', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: () => Promise.resolve('Internal Error'),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(fetchOAuthDeviceCode()).rejects.toThrow('OAuth 设备码请求失败 500: Internal Error');
  });

  it('passes signal to fetch', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: {
          verification_uri: 'https://biji.com/verify',
          user_code: 'ABCD-1234',
          code: 'dev_abc',
          interval: 5,
        },
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const controller = new AbortController();
    await fetchOAuthDeviceCode(controller.signal);

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ signal: controller.signal })
    );
  });
});

describe('pollOAuthToken', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    // Stub setTimeout/clearTimeout so polls don't actually wait 5s each
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return 0;
    });
    vi.spyOn(globalThis, 'clearTimeout').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns api_key and client_id on success (status 0)', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: true,
        data: { api_key: 'gk_live_abc', client_id: 'cli_123' },
        status: 0,
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await pollOAuthToken('dev_abc', 5);

    expect(result).toEqual({ api_key: 'gk_live_abc', client_id: 'cli_123' });
  });

  it('polls again on pending status 10012 and returns on success', async () => {
    let callCount = 0;
    const mockFetch = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ status: 10012 }) });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          success: true,
          data: { api_key: 'gk_live_ok', client_id: 'cli_ok' },
          status: 0,
        }),
      });
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await pollOAuthToken('dev_abc', 5);

    expect(callCount).toBe(2);
    expect(result).toEqual({ api_key: 'gk_live_ok', client_id: 'cli_ok' });
  });

  it('throws on expired status 10013', async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ status: 10013, message: 'code expired' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(pollOAuthToken('dev_abc', 5)).rejects.toThrow('OAuth 授权已过期，请重试');
  });

  it('throws on timeout after max attempts', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ status: 10012 }),
    });
    vi.stubGlobal('fetch', mockFetch);

    await expect(pollOAuthToken('dev_abc', 5)).rejects.toThrow('OAuth 授权超时，请重试');
  });

  it('throws on abort before first fetch', async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);

    const controller = new AbortController();
    controller.abort();

    await expect(pollOAuthToken('dev_abc', 5, controller.signal)).rejects.toThrow('Aborted');
  });
});