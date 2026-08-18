const WEB_LOGIN_URL = 'https://www.biji.com/note';
const WEB_API_URL_PREFIX = 'https://get-notes.luojilab.com/';
const WEB_AUTH_PARTITION = 'persist:dedao-brain-web-auth';
const DEFAULT_CAPTURE_TIMEOUT_MS = 2 * 60 * 1000;

export interface DesktopWebAuthRequestDetails {
  url: string;
  requestHeaders: Record<string, string | string[]>;
}

export type DesktopWebAuthRequestListener = (
  details: DesktopWebAuthRequestDetails,
  callback: (response: { requestHeaders: Record<string, string | string[]> }) => void,
) => void;

interface DesktopWebAuthSession {
  webRequest: {
    onBeforeSendHeaders(
      filterOrListener: { urls: string[] } | DesktopWebAuthRequestListener | null,
      listener?: DesktopWebAuthRequestListener | null,
    ): void;
  };
  clearStorageData(): Promise<void>;
  clearCache(): Promise<void>;
  closeAllConnections?(): Promise<void>;
}

interface DesktopWebAuthWindow {
  webContents: {
    setWindowOpenHandler(handler: () => { action: 'deny' }): void;
  };
  once(event: string, listener: () => void): void;
  on(event: string, listener: () => void): void;
  loadURL(url: string): Promise<void>;
  show(): void;
  focus(): void;
  close(): void;
  isDestroyed(): boolean;
}

export interface DesktopWebAuthElectron {
  BrowserWindow: new (options: Record<string, unknown>) => DesktopWebAuthWindow;
  session: {
    fromPartition(partition: string): DesktopWebAuthSession;
  };
}

export interface DesktopWebAuthManager {
  captureToken(validate: (token: string) => Promise<void>): Promise<string>;
  clearSession(): Promise<void>;
  dispose(): void;
}

type ElectronRequire = (moduleName: string) => unknown;

function isDesktopWebAuthElectron(value: unknown): value is DesktopWebAuthElectron {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DesktopWebAuthElectron>;
  return typeof candidate.BrowserWindow === 'function'
    && typeof candidate.session?.fromPartition === 'function';
}

export function resolveDesktopWebAuthElectron(
  requireFn: ElectronRequire,
): DesktopWebAuthElectron | null {
  try {
    const remote = requireFn('@electron/remote');
    if (isDesktopWebAuthElectron(remote)) return remote;
  } catch {
    // Older Obsidian versions may expose only electron.remote.
  }

  try {
    const electron = requireFn('electron');
    if (electron && typeof electron === 'object') {
      const remote = (electron as { remote?: unknown }).remote;
      if (isDesktopWebAuthElectron(remote)) return remote;
    }
    if (isDesktopWebAuthElectron(electron)) return electron;
  } catch {
    // Desktop auth is optional; manual token entry remains available.
  }

  return null;
}

export function extractAuthorizationToken(
  headers: Record<string, string | string[]>,
): string | null {
  const entry = Object.entries(headers)
    .find(([name]) => name.toLowerCase() === 'authorization');
  const value = Array.isArray(entry?.[1]) ? entry[1][0] : entry?.[1];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return /^Bearer\s+\S+$/i.test(trimmed) ? trimmed : null;
}

function defaultElectronLoader(): DesktopWebAuthElectron | null {
  const requireFn = (globalThis as typeof globalThis & {
    require?: (moduleName: string) => unknown;
  }).require;
  if (typeof requireFn !== 'function') return null;
  return resolveDesktopWebAuthElectron(requireFn);
}

class ElectronDesktopWebAuthManager implements DesktopWebAuthManager {
  private readonly authSession: DesktopWebAuthSession;
  private activeWindow: DesktopWebAuthWindow | null = null;
  private activeCapture: Promise<string> | null = null;
  private rejectActiveCapture: ((error: Error) => void) | null = null;
  private captureTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly electron: DesktopWebAuthElectron,
    private readonly timeoutMs: number,
  ) {
    this.authSession = electron.session.fromPartition(WEB_AUTH_PARTITION);
  }

  captureToken(validate: (token: string) => Promise<void>): Promise<string> {
    if (this.activeCapture) {
      this.activeWindow?.focus();
      return this.activeCapture;
    }

    const validatingTokens = new Set<string>();
    let settled = false;

    this.activeCapture = new Promise<string>((resolve, reject) => {
      this.rejectActiveCapture = reject;
      const finish = (token: string) => {
        if (settled) return;
        settled = true;
        this.cleanupCapture(true);
        resolve(token);
      };
      const fail = (error: Error) => {
        if (settled) return;
        settled = true;
        this.cleanupCapture(true);
        reject(error);
      };

      const listener: DesktopWebAuthRequestListener = (details, callback) => {
        callback({ requestHeaders: details.requestHeaders });
        if (settled || !details.url.startsWith(WEB_API_URL_PREFIX)) return;
        const token = extractAuthorizationToken(details.requestHeaders);
        if (!token || validatingTokens.has(token)) return;
        validatingTokens.add(token);
        void validate(token)
          .then(() => finish(token))
          .catch(() => {
            // A persistent browser session can emit an expired token before
            // the user completes a fresh login. Keep the window open and wait
            // for a different, valid token without exposing credential data.
          })
          .finally(() => validatingTokens.delete(token));
      };
      this.authSession.webRequest.onBeforeSendHeaders(
        { urls: [`${WEB_API_URL_PREFIX}*`] },
        listener,
      );

      const loginWindow = new this.electron.BrowserWindow({
        width: 960,
        height: 760,
        show: false,
        title: 'Dedao Brain Web Login',
        webPreferences: {
          session: this.authSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          webviewTag: false,
        },
      });
      this.activeWindow = loginWindow;
      loginWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      loginWindow.once('ready-to-show', () => loginWindow.show());
      loginWindow.on('closed', () => {
        this.activeWindow = null;
        if (!settled) fail(new Error('Desktop Web authentication window closed'));
      });

      this.captureTimeout = setTimeout(() => {
        fail(new Error('Desktop Web authentication timed out'));
      }, this.timeoutMs);

      void loginWindow.loadURL(WEB_LOGIN_URL).catch(error => {
        fail(error instanceof Error ? error : new Error(String(error)));
      });
    }).finally(() => {
      this.activeCapture = null;
      this.rejectActiveCapture = null;
    });

    return this.activeCapture;
  }

  async clearSession(): Promise<void> {
    this.dispose();
    let firstError: unknown;
    const cleanupSteps = [
      () => this.authSession.closeAllConnections?.(),
      () => this.authSession.clearStorageData(),
      () => this.authSession.clearCache(),
    ];
    for (const cleanup of cleanupSteps) {
      try {
        await cleanup();
      } catch (error) {
        firstError ??= error;
      }
    }
    if (firstError !== undefined) throw firstError;
  }

  dispose(): void {
    const reject = this.rejectActiveCapture;
    this.rejectActiveCapture = null;
    this.cleanupCapture(true);
    reject?.(new Error('Desktop Web authentication cancelled'));
  }

  private cleanupCapture(closeWindow: boolean): void {
    if (this.captureTimeout !== null) {
      clearTimeout(this.captureTimeout);
      this.captureTimeout = null;
    }
    this.authSession.webRequest.onBeforeSendHeaders(null);
    const loginWindow = this.activeWindow;
    this.activeWindow = null;
    if (closeWindow && loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
    }
  }
}

export function createDesktopWebAuthManager({
  isDesktopApp,
  loadElectron = defaultElectronLoader,
  timeoutMs = DEFAULT_CAPTURE_TIMEOUT_MS,
}: {
  isDesktopApp: boolean;
  loadElectron?: () => DesktopWebAuthElectron | null | undefined;
  timeoutMs?: number;
}): DesktopWebAuthManager | null {
  if (!isDesktopApp) return null;
  const electron = loadElectron();
  return electron ? new ElectronDesktopWebAuthManager(electron, timeoutMs) : null;
}
