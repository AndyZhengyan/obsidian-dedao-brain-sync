import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchOAuthDeviceCode, pollOAuthToken } from '../src/api';

const BASE_URL = 'https://openapi.biji.com/open/api/v1';

function mockFetchResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
    arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
  } as unknown as Response;
}

describe('fetchOAuthDeviceCode', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(globalThis, 'setTimeout').mockImplementation((fn: () => void) => {
      fn();
      return 0;
    });
    vi.spyOn(globalThis, 'clearTimeout').mockReturnValue(undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('POSTs to /oauth/device/code with correct body', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({
        success: true,
        data: {
          verification_uri: 'https://biji.com/verify',
          user_code: 'ABCD-1234',
          code: 'dev_abc',
          interval: 5,
        },
      }) as Response
    );

    const result = await fetchOAuthDeviceCode();

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(`${BASE_URL}/oauth/device/code`),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ success: false, message: 'invalid client' }) as Response
    );

    await expect(fetchOAuthDeviceCode()).rejects.toThrow('invalid client');
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      headers: new Headers({}),
      json: () => Promise.resolve({}),
      text: () => Promise.resolve('Internal Error'),
      arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
    } as Response);

    await expect(fetchOAuthDeviceCode()).rejects.toThrow('OAuth 设备码请求失败 500: Internal Error');
  });

  it('throws on abort before request', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const controller = new AbortController();
    controller.abort();

    await expect(fetchOAuthDeviceCode(controller.signal)).rejects.toThrow('Aborted');
    expect(fetchSpy).not.toHaveBeenCalled();
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
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({
        success: true,
        data: { api_key: 'gk_live_abc', client_id: 'cli_123' },
        status: 0,
      }) as Response
    );

    const result = await pollOAuthToken('dev_abc', 5);

    expect(result).toEqual({ api_key: 'gk_live_abc', client_id: 'cli_123' });
  });

  it('polls again on pending status 10012 and returns on success', async () => {
    let callCount = 0;
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve(mockFetchResponse({ status: 10012 }) as Response);
      }
      return Promise.resolve(
        mockFetchResponse({
          success: true,
          data: { api_key: 'gk_live_ok', client_id: 'cli_ok' },
          status: 0,
        }) as Response
      );
    });

    const result = await pollOAuthToken('dev_abc', 5);

    expect(callCount).toBe(2);
    expect(result).toEqual({ api_key: 'gk_live_ok', client_id: 'cli_ok' });
  });

  it('throws on expired status 10013', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ status: 10013, message: 'code expired' }) as Response
    );

    await expect(pollOAuthToken('dev_abc', 5)).rejects.toThrow('OAuth 授权已过期，请重试');
  });

  it('throws with raw JSON on unknown status', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      mockFetchResponse({ status: 999, message: 'weird response' }) as Response
    );

    const err = await pollOAuthToken('dev_abc', 5).catch(e => e.message);
    expect(err).toContain('999');
    expect(err).toContain('weird response');
  });

  it('throws on timeout after max attempts', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      mockFetchResponse({ status: 10012 }) as Response
    );

    await expect(pollOAuthToken('dev_abc', 5)).rejects.toThrow('OAuth 授权超时，请重试');
  });

  it('throws on abort before first fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');

    const controller = new AbortController();
    controller.abort();

    await expect(pollOAuthToken('dev_abc', 5, controller.signal)).rejects.toThrow('Aborted');
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});