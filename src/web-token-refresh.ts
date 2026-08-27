import type { DesktopWebAuthCaptureOptions } from './desktop-web-auth';

export interface WebTokenRefreshCoordinatorOptions {
  captureToken(
    validate: (token: string) => Promise<void>,
    options?: DesktopWebAuthCaptureOptions,
  ): Promise<string>;
  validate(token: string): Promise<void>;
  persist(token: string): Promise<void>;
  notifyFailure(): void;
}

export class WebTokenRefreshCoordinator {
  private activeRefresh: Promise<string> | null = null;
  private failureNotified = false;

  constructor(private readonly options: WebTokenRefreshCoordinatorOptions) {}

  refresh(): Promise<string> {
    if (this.activeRefresh) return this.activeRefresh;

    this.activeRefresh = this.options.captureToken(this.options.validate, { interactive: false })
      .then(async token => {
        await this.options.persist(token);
        this.failureNotified = false;
        return token;
      })
      .catch(error => {
        if (!this.failureNotified) {
          this.failureNotified = true;
          this.options.notifyFailure();
        }
        throw error;
      })
      .finally(() => {
        this.activeRefresh = null;
      });

    return this.activeRefresh;
  }
}
