import { Notice } from 'obsidian';

const PREFIX = '[得到大脑]';

export function showNotice(message: string, timeout = 5000): void {
  new Notice(`${PREFIX} ${message}`, timeout);
}

export function showError(message: string, timeout = 7000): void {
  const n = new Notice(`❌ ${PREFIX} ${message}`, timeout);
  n.messageEl.addClass('getnote-notice-error');
}

export function showSuccess(message: string, timeout = 5000): void {
  const n = new Notice(`✅ ${PREFIX} ${message}`, timeout);
  n.messageEl.addClass('getnote-notice-success');
}

export function showInfo(message: string, timeout = 4000): void {
  new Notice(`${PREFIX} ${message}`, timeout);
}
