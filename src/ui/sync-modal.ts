import { App, Modal } from 'obsidian';
import type { SyncResult } from '../types';
import { t } from '../i18n';

export class SyncModal extends Modal {
  private statusEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private countEl!: HTMLElement;
  private cancelBtn!: HTMLButtonElement;
  private progressFill!: HTMLElement;
  private cancelled = false;
  private onCancelCb?: () => void;

  constructor(app: App) {
    super(app);
    this.modalEl.style.padding = '24px';
  }

  onOpen() {
    const content = this.contentEl;

    content.createDiv({
      text: t('modal.title'),
      cls: 'getnote-sync-title',
    }).style.fontSize = '16px';
    content.createDiv('').style.marginBottom = '12px';

    this.progressEl = content.createDiv({ text: t('modal.connecting') });
    this.countEl = content.createDiv({ text: '' });
    this.countEl.style.marginTop = '4px';
    this.countEl.style.color = 'var(--text-muted)';

    // Progress bar
    const bar = content.createDiv({ cls: 'getnote-progress-bar' });
    bar.style.marginTop = '8px';
    bar.style.height = '4px';
    bar.style.background = 'var(--background-modifier-border)';
    bar.style.borderRadius = '2px';
    bar.style.overflow = 'hidden';
    this.progressFill = content.createDiv({ cls: 'getnote-progress-fill' });
    this.progressFill.style.height = '100%';
    this.progressFill.style.background = 'var(--interactive-accent)';
    this.progressFill.style.width = '0%';
    this.progressFill.style.transition = 'width 0.3s ease';

    this.statusEl = content.createDiv({ text: '' });
    this.statusEl.style.marginTop = '8px';
    this.statusEl.style.color = 'var(--text-muted)';

    // Cancel button
    const btnWrapper = content.createDiv({ cls: 'getnote-sync-modal-footer' });
    btnWrapper.style.marginTop = '16px';
    btnWrapper.style.display = 'flex';
    btnWrapper.style.justifyContent = 'flex-end';
    this.cancelBtn = btnWrapper.createEl('button', {
      text: t('modal.cancel'),
      cls: 'mod-warning',
    });
    this.cancelBtn.style.cursor = 'pointer';
    this.cancelBtn.onclick = () => {
      this.cancelled = true;
      this.cancelBtn.disabled = true;
      this.cancelBtn.textContent = t('modal.cancelled');
      this.progressEl.setText(t('modal.cancelled'));
      this.onCancelCb?.();
    };
  }

  setProgress(message: string) {
    if (this.progressEl) this.progressEl.setText(message);
  }

  setCount(message: string) {
    if (this.countEl) this.countEl.setText(message);
  }

  setProgressPercent(percent: number) {
    if (this.progressFill) this.progressFill.style.width = `${Math.min(percent, 100)}%`;
  }

  setOnCancel(cb: () => void) {
    this.onCancelCb = cb;
  }

  showResult(result: SyncResult) {
    this.progressFill.style.width = '100%';
    this.progressEl.setText(t('modal.done'));
    this.statusEl.setText(
      `${t('modal.created', { created: result.created })} · ${t('modal.updated', { updated: result.updated })} · ${t('modal.skipped', { skipped: result.skipped })} · ${t('modal.failed', { failed: result.failed })}`
    );
    this.countEl.setText(t('modal.total', { total: result.total }));
    this.cancelBtn.style.display = 'none';
    setTimeout(() => this.close(), 3000);
  }

  showCancelled() {
    this.progressEl.setText(t('modal.cancelled'));
    this.statusEl.setText('');
    this.cancelBtn.style.display = 'none';
    setTimeout(() => this.close(), 1500);
  }

  isCancelled(): boolean {
    return this.cancelled;
  }

  cancel(): void {
    if (!this.cancelled) {
      this.cancelled = true;
      if (this.cancelBtn) {
        this.cancelBtn.disabled = true;
        this.cancelBtn.textContent = t('modal.cancelled');
      }
      if (this.progressEl) this.progressEl.setText(t('modal.cancelled'));
      this.onCancelCb?.();
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
