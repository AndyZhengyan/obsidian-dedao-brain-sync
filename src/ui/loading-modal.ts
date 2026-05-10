import { App, Modal } from 'obsidian';
import { t } from '../i18n';

export class LoadingModal extends Modal {
  private messageEl!: HTMLElement;

  constructor(app: App) {
    super(app);
    this.modalEl.addClass('getnote-loading-modal');
  }

  onOpen() {
    const content = this.contentEl;

    content.createDiv({
      text: '⏳',
      cls: 'getnote-loading-spinner',
    });

    this.messageEl = content.createDiv({
      text: t('loading'),
      cls: 'getnote-loading-message',
    });
  }

  setMessage(message: string) {
    if (this.messageEl) {
      this.messageEl.setText(message);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
