export interface AutoUploadConfig {
  enabled: boolean;
  mode: 'realtime' | 'interval';
  intervalMinutes: number;
}

interface AutoUploadCallbacks {
  run: (paths?: string[]) => Promise<void>;
  isBusy: () => boolean;
  onError: (error: unknown) => void;
}

const DEBOUNCE_MS = 5_000;
const RETRY_MS = 60_000;

/** Owns upload timing only; the upload engine decides which changes are safe to write. */
export class AutoUploadScheduler {
  private config: AutoUploadConfig | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private paths = new Set<string>();
  private fullScan = false;
  private running = false;
  private disposed = false;
  private generation = 0;
  private retryAfter = 0;

  constructor(private readonly callbacks: AutoUploadCallbacks) {}

  configure(config: AutoUploadConfig): void {
    if (this.disposed) return;
    const normalized = {
      ...config,
      intervalMinutes: Number.isFinite(config.intervalMinutes)
        ? Math.max(1, config.intervalMinutes) : 5,
    };
    if (this.config?.enabled === normalized.enabled
      && this.config.mode === normalized.mode
      && this.config.intervalMinutes === normalized.intervalMinutes) return;
    this.config = normalized;
    this.generation++;
    this.clearTimer();
    this.paths.clear();
    this.retryAfter = 0;
    this.fullScan = normalized.enabled;
    if (normalized.enabled) this.schedule(this.initialDelay());
  }

  notify(path: string): void {
    if (this.disposed || !this.config?.enabled || this.config.mode !== 'realtime') return;
    this.paths.add(path);
    this.schedule(DEBOUNCE_MS);
  }

  dispose(): void {
    this.disposed = true;
    this.generation++;
    this.clearTimer();
    this.paths.clear();
    this.fullScan = false;
  }

  private initialDelay(): number {
    return this.config?.mode === 'interval'
      ? this.config.intervalMinutes * 60_000 : DEBOUNCE_MS;
  }

  private clearTimer(): void {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  private schedule(delay: number): void {
    if (this.disposed || !this.config?.enabled) return;
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.timer = undefined;
      void this.flush();
    }, Math.max(delay, this.retryAfter - Date.now()));
  }

  private async flush(): Promise<void> {
    if (this.disposed || !this.config?.enabled) return;
    if (this.running || this.callbacks.isBusy()) {
      this.schedule(DEBOUNCE_MS);
      return;
    }
    const generation = this.generation;
    const fullScan = this.fullScan;
    const paths = [...this.paths];
    if (!fullScan && paths.length === 0) return;
    this.fullScan = false;
    this.paths.clear();
    this.running = true;
    let failed = false;
    try {
      await this.callbacks.run(fullScan ? undefined : paths);
    } catch (error) {
      failed = true;
      if (generation === this.generation && !this.disposed) {
        this.fullScan ||= fullScan;
        for (const path of paths) this.paths.add(path);
        this.retryAfter = Date.now() + RETRY_MS;
      }
      this.callbacks.onError(error);
    } finally {
      this.running = false;
      if (generation === this.generation && !this.disposed && this.config.enabled) {
        if (failed) {
          this.schedule(RETRY_MS);
        } else {
          this.retryAfter = 0;
          if (this.config.mode === 'interval') {
            this.fullScan = true;
            this.schedule(this.initialDelay());
          } else if ((this.fullScan || this.paths.size > 0) && this.timer === undefined) {
            this.schedule(DEBOUNCE_MS);
          }
        }
      }
    }
  }
}
