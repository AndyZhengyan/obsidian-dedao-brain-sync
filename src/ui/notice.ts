import { Notice } from 'obsidian';

export function showNotice(message: string, timeout = 5000): void {
  new Notice(message, timeout);
}

export function showError(message: string, timeout = 7000): void {
  new Notice(`❌ ${message}`, timeout);
}

export function showSuccess(message: string, timeout = 5000): void {
  const n = new Notice(message, timeout);
  const el = n.noticeEl;
  if (el) {
    el.style.color = '#5fb05f';
    el.style.fontWeight = '500';
  }
}

export function showInfo(message: string, timeout = 4000): void {
  new Notice(message, timeout);
}
