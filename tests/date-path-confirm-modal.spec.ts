import { describe, expect, it, vi } from 'vitest';
import { App } from 'obsidian';
import {
  DatePathConfirmModal,
  type DatePathConfirmationRequest,
} from '../src/ui/date-path-confirm-modal';
import { initI18n } from '../src/i18n';

const enableRequest: DatePathConfirmationRequest = {
  mode: 'apply',
  current: { enabled: false, format: 'YYYY/MM' },
  target: { enabled: true, format: 'YYYY/MM' },
};

describe('DatePathConfirmModal', () => {
  it('uses the native Obsidian Modal surface and resolves true only on confirmation', () => {
    initI18n('zh-CN');
    const resolve = vi.fn();
    const modal = new DatePathConfirmModal(new App(), enableRequest, resolve);

    modal.onOpen();

    expect(modal).toHaveProperty('modalEl');
    expect(modal.contentEl.textContent).toContain('立即整理本地历史笔记');
    expect(modal.contentEl.textContent).toContain('实际引用的附件');
    expect(modal.contentEl.textContent).toContain('冲突会跳过，不会覆盖');
    expect(modal.contentEl.textContent).toContain('可重复执行');
    const confirm = Array.from(modal.contentEl.querySelectorAll('button'))
      .find(button => button.textContent === '确认并立即整理')!;
    confirm.click();
    expect(resolve).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledWith(true);
  });

  it('resolves false when cancelled or closed with Escape', () => {
    initI18n('zh-CN');
    const cancelResolve = vi.fn();
    const cancelModal = new DatePathConfirmModal(new App(), enableRequest, cancelResolve);
    cancelModal.onOpen();
    const cancel = Array.from(cancelModal.contentEl.querySelectorAll('button'))
      .find(button => button.textContent === '取消')!;
    cancel.click();
    expect(cancelResolve).toHaveBeenCalledWith(false);

    const escapeResolve = vi.fn();
    const escapeModal = new DatePathConfirmModal(new App(), enableRequest, escapeResolve);
    escapeModal.onOpen();
    escapeModal.onClose();
    expect(escapeResolve).toHaveBeenCalledWith(false);
  });
});
