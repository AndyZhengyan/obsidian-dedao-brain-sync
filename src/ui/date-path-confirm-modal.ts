import { App, Modal } from 'obsidian';
import type { DatePathMigrationTarget } from '../date-path-migration';
import { t } from '../i18n';

export interface DatePathConfirmationRequest {
  mode: 'apply' | 'reconcile';
  current: DatePathMigrationTarget;
  target: DatePathMigrationTarget;
}

function confirmationSummary(request: DatePathConfirmationRequest): string {
  if (request.mode === 'reconcile') return t('settings.datePath.confirm.reconcile');
  if (!request.current.enabled && request.target.enabled) return t('settings.datePath.confirm.enable');
  if (request.current.enabled && !request.target.enabled) return t('settings.datePath.confirm.disable');
  return t('settings.datePath.confirm.format', {
    from: request.current.format,
    to: request.target.format,
  });
}

export class DatePathConfirmModal extends Modal {
  private settled = false;

  constructor(
    app: App,
    private readonly request: DatePathConfirmationRequest,
    private readonly resolveConfirmation: (confirmed: boolean) => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.contentEl.replaceChildren();
    this.contentEl.classList.add('getnote-date-path-confirm-content');

    const title = document.createElement('h2');
    title.textContent = t('settings.datePath.confirm.title');
    this.contentEl.appendChild(title);

    const summary = document.createElement('p');
    summary.textContent = confirmationSummary(this.request);
    this.contentEl.appendChild(summary);

    const details = document.createElement('p');
    details.textContent = t('settings.datePath.confirm.details');
    this.contentEl.appendChild(details);

    const actions = document.createElement('div');
    actions.className = 'getnote-date-path-modal-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'mod-secondary';
    cancel.textContent = t('settings.datePath.cancel');
    cancel.addEventListener('click', () => this.finish(false));
    const confirm = document.createElement('button');
    confirm.type = 'button';
    confirm.className = 'mod-cta';
    confirm.textContent = t('settings.datePath.confirm.action');
    confirm.addEventListener('click', () => this.finish(true));
    actions.append(cancel, confirm);
    this.contentEl.appendChild(actions);
  }

  onClose(): void {
    this.finish(false, false);
    this.contentEl.replaceChildren();
  }

  private finish(confirmed: boolean, close = true): void {
    if (this.settled) return;
    this.settled = true;
    this.resolveConfirmation(confirmed);
    if (close) this.close();
  }
}

export function confirmDatePathMigration(
  app: App,
  request: DatePathConfirmationRequest,
): Promise<boolean> {
  return new Promise(resolve => {
    new DatePathConfirmModal(app, request, resolve).open();
  });
}
