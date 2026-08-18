import { describe, expect, it, vi } from 'vitest';
import {
  createDesktopWebAuthManager,
  extractAuthorizationToken,
  resolveDesktopWebAuthElectron,
  type DesktopWebAuthElectron,
  type DesktopWebAuthRequestListener,
} from '../src/desktop-web-auth';

function makeElectron() {
  let requestListener: DesktopWebAuthRequestListener | null = null;
  const session = {
    webRequest: {
      onBeforeSendHeaders: vi.fn(function (
        filterOrListener: unknown,
        maybeListener?: DesktopWebAuthRequestListener | null,
      ) {
        requestListener = arguments.length === 1
          ? filterOrListener as DesktopWebAuthRequestListener | null
          : maybeListener ?? null;
      }),
    },
    clearStorageData: vi.fn().mockResolvedValue(undefined),
    clearCache: vi.fn().mockResolvedValue(undefined),
    closeAllConnections: vi.fn().mockResolvedValue(undefined),
  };

  class FakeBrowserWindow {
    static instances: FakeBrowserWindow[] = [];
    readonly events = new Map<string, () => void>();
    readonly webContents = {
      setWindowOpenHandler: vi.fn(),
    };
    readonly loadURL = vi.fn().mockResolvedValue(undefined);
    readonly show = vi.fn();
    readonly focus = vi.fn();
    readonly close = vi.fn(() => this.events.get('closed')?.());
    readonly isDestroyed = vi.fn(() => false);

    constructor(readonly options: Record<string, unknown>) {
      FakeBrowserWindow.instances.push(this);
    }

    once(event: string, listener: () => void): void {
      this.events.set(event, listener);
    }

    on(event: string, listener: () => void): void {
      this.events.set(event, listener);
    }
  }

  const electron: DesktopWebAuthElectron = {
    BrowserWindow: FakeBrowserWindow,
    session: {
      fromPartition: vi.fn(() => session),
    },
  };

  return {
    electron,
    session,
    FakeBrowserWindow,
    getRequestListener: () => requestListener,
  };
}

describe('desktop Web auth', () => {
  it('prefers the modern Electron remote bridge exposed by Obsidian', () => {
    const fixture = makeElectron();
    const legacy = makeElectron();
    const requireFn = vi.fn((moduleName: string) => {
      if (moduleName === '@electron/remote') return fixture.electron;
      if (moduleName === 'electron') return { remote: legacy.electron };
      throw new Error(`unexpected module: ${moduleName}`);
    });

    expect(resolveDesktopWebAuthElectron(requireFn)).toBe(fixture.electron);
    expect(requireFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to the legacy Electron remote bridge when needed', () => {
    const fixture = makeElectron();
    const requireFn = vi.fn((moduleName: string) => {
      if (moduleName === '@electron/remote') throw new Error('not installed');
      if (moduleName === 'electron') return { remote: fixture.electron };
      throw new Error(`unexpected module: ${moduleName}`);
    });

    expect(resolveDesktopWebAuthElectron(requireFn)).toBe(fixture.electron);
  });

  it('rejects incomplete Electron bridges instead of crashing later', () => {
    const requireFn = vi.fn((moduleName: string) => {
      if (moduleName === '@electron/remote') return { BrowserWindow: class {} };
      if (moduleName === 'electron') return { session: {} };
      throw new Error(`unexpected module: ${moduleName}`);
    });

    expect(resolveDesktopWebAuthElectron(requireFn)).toBeNull();
  });

  it('extracts only a non-empty Bearer Authorization header case-insensitively', () => {
    expect(extractAuthorizationToken({ Authorization: 'Bearer token-one' })).toBe('Bearer token-one');
    expect(extractAuthorizationToken({ authorization: ['Bearer token-two'] })).toBe('Bearer token-two');
    expect(extractAuthorizationToken({ Authorization: 'Basic secret' })).toBeNull();
    expect(extractAuthorizationToken({ Authorization: 'Bearer   ' })).toBeNull();
  });

  it('does not load Electron when desktop-app support is unavailable', () => {
    const loadElectron = vi.fn();

    const manager = createDesktopWebAuthManager({
      isDesktopApp: false,
      loadElectron,
    });

    expect(manager).toBeNull();
    expect(loadElectron).not.toHaveBeenCalled();
  });

  it('captures an allowed API Bearer token in a sandboxed isolated window and resolves after validation', async () => {
    const fixture = makeElectron();
    const manager = createDesktopWebAuthManager({
      isDesktopApp: true,
      loadElectron: () => fixture.electron,
    });
    expect(manager).not.toBeNull();

    const validate = vi.fn().mockResolvedValue(undefined);
    const capture = manager!.captureToken(validate);
    const windowInstance = fixture.FakeBrowserWindow.instances[0];
    expect(windowInstance).toBeTruthy();
    expect(windowInstance.options).toMatchObject({
      webPreferences: {
        session: fixture.session,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        webviewTag: false,
      },
    });
    expect(windowInstance.webContents.setWindowOpenHandler).toHaveBeenCalled();

    const listener = fixture.getRequestListener();
    expect(listener).not.toBeNull();
    const continueRequest = vi.fn();
    listener!(
      {
        url: 'https://get-notes.luojilab.com/voicenotes/web/notes',
        requestHeaders: { authorization: 'Bearer captured-token' },
      },
      continueRequest,
    );

    await expect(capture).resolves.toBe('Bearer captured-token');
    expect(validate).toHaveBeenCalledWith('Bearer captured-token');
    expect(continueRequest).toHaveBeenCalledWith({
      requestHeaders: { authorization: 'Bearer captured-token' },
    });
    expect(windowInstance.close).toHaveBeenCalled();
    expect(fixture.session.webRequest.onBeforeSendHeaders).toHaveBeenLastCalledWith(null);
  });

  it('keeps waiting when a stale captured token fails validation', async () => {
    const fixture = makeElectron();
    const manager = createDesktopWebAuthManager({
      isDesktopApp: true,
      loadElectron: () => fixture.electron,
    })!;
    const validate = vi.fn()
      .mockRejectedValueOnce(new Error('expired'))
      .mockResolvedValueOnce(undefined);
    let resolved = false;
    const capture = manager.captureToken(validate).then(value => {
      resolved = true;
      return value;
    });
    const listener = fixture.getRequestListener()!;

    listener({ url: 'https://get-notes.luojilab.com/a', requestHeaders: { Authorization: 'Bearer stale' } }, vi.fn());
    await Promise.resolve();
    await Promise.resolve();
    expect(resolved).toBe(false);

    listener({ url: 'https://get-notes.luojilab.com/b', requestHeaders: { Authorization: 'Bearer fresh' } }, vi.fn());
    await expect(capture).resolves.toBe('Bearer fresh');
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('retries the same captured token after a transient validation failure', async () => {
    const fixture = makeElectron();
    const manager = createDesktopWebAuthManager({
      isDesktopApp: true,
      loadElectron: () => fixture.electron,
    })!;
    const validate = vi.fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce(undefined);
    const capture = manager.captureToken(validate);
    const listener = fixture.getRequestListener()!;
    const details = {
      url: 'https://get-notes.luojilab.com/voicenotes/web/notes',
      requestHeaders: { Authorization: 'Bearer retry-me' },
    };

    listener(details, vi.fn());
    await new Promise(resolve => setTimeout(resolve, 0));
    listener(details, vi.fn());

    await expect(capture).resolves.toBe('Bearer retry-me');
    expect(validate).toHaveBeenCalledTimes(2);
  });

  it('clears the persistent login session and closes active connections', async () => {
    const fixture = makeElectron();
    const manager = createDesktopWebAuthManager({
      isDesktopApp: true,
      loadElectron: () => fixture.electron,
    })!;

    await manager.clearSession();

    expect(fixture.session.clearStorageData).toHaveBeenCalledWith();
    expect(fixture.session.clearCache).toHaveBeenCalledWith();
    expect(fixture.session.closeAllConnections).toHaveBeenCalledWith();
  });

  it('attempts every session cleanup step even when one step fails', async () => {
    const fixture = makeElectron();
    fixture.session.closeAllConnections.mockRejectedValueOnce(new Error('connection cleanup failed'));
    const manager = createDesktopWebAuthManager({
      isDesktopApp: true,
      loadElectron: () => fixture.electron,
    })!;

    await expect(manager.clearSession()).rejects.toThrow('connection cleanup failed');

    expect(fixture.session.closeAllConnections).toHaveBeenCalledWith();
    expect(fixture.session.clearStorageData).toHaveBeenCalledWith();
    expect(fixture.session.clearCache).toHaveBeenCalledWith();
  });

  it('rejects capture when the login window is closed by the user', async () => {
    const fixture = makeElectron();
    const manager = createDesktopWebAuthManager({
      isDesktopApp: true,
      loadElectron: () => fixture.electron,
    })!;

    const capture = manager.captureToken(vi.fn());
    const rejection = expect(capture).rejects.toThrow('window closed');
    fixture.FakeBrowserWindow.instances[0].events.get('closed')?.();

    await rejection;
    expect(fixture.session.webRequest.onBeforeSendHeaders).toHaveBeenLastCalledWith(null);
  });

  it('rejects capture after the timeout and closes the login window', async () => {
    vi.useFakeTimers();
    try {
      const fixture = makeElectron();
      const manager = createDesktopWebAuthManager({
        isDesktopApp: true,
        loadElectron: () => fixture.electron,
        timeoutMs: 25,
      })!;

      const capture = manager.captureToken(vi.fn());
      const rejection = expect(capture).rejects.toThrow('timed out');
      await vi.advanceTimersByTimeAsync(25);

      await rejection;
      expect(fixture.FakeBrowserWindow.instances[0].close).toHaveBeenCalledWith();
    } finally {
      vi.useRealTimers();
    }
  });
});
