import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'preact/test-utils';
import { App } from 'obsidian';
import GetNoteSyncPlugin from '../src/main';
import { GetNoteSettingsTab } from '../src/settings-tab';
import { initI18n } from '../src/i18n';
import { DEFAULT_SETTINGS } from '../src/types';

function makePlugin(): GetNoteSyncPlugin {
  const plugin = new GetNoteSyncPlugin(new App());
  plugin.settings = {
    ...DEFAULT_SETTINGS,
    scheduledSync: {
      ...DEFAULT_SETTINGS.scheduledSync,
      enabled: true,
    },
    syncHistory: [],
  };
  plugin.syncHistory = [];
  return plugin;
}

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

afterEach(() => {
  vi.restoreAllMocks();
  initI18n('zh-CN');
  document.body.innerHTML = '';
});

describe('GetNoteSettingsTab runtime updates', () => {
  it('mounts once per display lifecycle and remounts after hide', async () => {
    const plugin = makePlugin();
    const tab = new GetNoteSettingsTab(plugin.app, plugin);

    await act(() => {
      tab.display();
    });
    const firstRoot = tab.containerEl.querySelector('.getnote-settings-react');

    await act(() => {
      tab.display();
    });
    expect(tab.containerEl.querySelector('.getnote-settings-react')).toBe(firstRoot);

    await act(() => {
      tab.hide();
    });
    expect(tab.containerEl.childElementCount).toBe(0);

    await act(() => {
      tab.display();
    });
    expect(tab.containerEl.querySelector('.getnote-settings-react')).not.toBe(firstRoot);
  });

  it('updates progress and quota without rebuilding or disturbing local UI state', async () => {
    const plugin = makePlugin();
    const tab = new GetNoteSettingsTab(plugin.app, plugin);
    const runtimeTab = tab as GetNoteSettingsTab & { updateRuntimeState: () => void };
    document.body.appendChild(tab.containerEl);

    await act(() => {
      tab.display();
    });

    tab.containerEl.scrollTop = 420;

    const scheduledDisclosure = tab.containerEl.querySelector(
      '.getnote-scheduled-master-row .getnote-inline-disclosure',
    ) as HTMLButtonElement;
    const attachmentDisclosure = tab.containerEl.querySelector(
      '.getnote-attachment-master-row .getnote-inline-disclosure',
    ) as HTMLButtonElement;
    await act(() => {
      click(scheduledDisclosure);
      click(attachmentDisclosure);
    });

    const folderInput = tab.containerEl.querySelector(
      'input[placeholder="得到大脑"]',
    ) as HTMLInputElement;
    await act(() => {
      folderInput.value = '尚未保存的本地输入';
      folderInput.dispatchEvent(new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: '尚未保存的本地输入',
      }));
    });
    folderInput.focus();
    folderInput.setSelectionRange(2, 6);

    const noteTypeTrigger = tab.containerEl.querySelector(
      '.getnote-note-type-select-trigger',
    ) as HTMLButtonElement;
    await act(() => {
      click(noteTypeTrigger);
    });

    expect(tab.containerEl.querySelector('.getnote-note-type-select-menu')).not.toBeNull();
    expect(typeof runtimeTab.updateRuntimeState).toBe('function');

    plugin.isSyncing = true;
    plugin.syncProgress = {
      message: '正在同步第 1 批',
      count: '处理中 1 条',
      percent: 25,
    };
    plugin.settings.lastQuotaState = {
      exhausted: true,
      reason: 'quota_day',
      checkedAt: Date.now(),
    };
    await act(() => {
      runtimeTab.updateRuntimeState();
    });

    plugin.syncProgress = {
      message: '正在同步第 2 批',
      count: '处理中 2 条',
      percent: 75,
    };
    await act(() => {
      runtimeTab.updateRuntimeState();
    });

    expect(tab.containerEl.scrollTop).toBe(420);
    expect(scheduledDisclosure.getAttribute('aria-expanded')).toBe('true');
    expect(attachmentDisclosure.getAttribute('aria-expanded')).toBe('true');
    expect(tab.containerEl.querySelector('input[placeholder="得到大脑"]')).toBe(folderInput);
    expect(folderInput.value).toBe('尚未保存的本地输入');
    expect(document.activeElement).toBe(folderInput);
    expect(folderInput.selectionStart).toBe(2);
    expect(folderInput.selectionEnd).toBe(6);
    expect(tab.containerEl.querySelector('.getnote-note-type-select-trigger')).toBe(noteTypeTrigger);
    expect(tab.containerEl.querySelector('.getnote-note-type-select-menu')).not.toBeNull();
    expect(tab.containerEl.textContent).toContain('正在同步第 2 批');
    expect(tab.containerEl.textContent).toContain('处理中 2 条');
    expect(tab.containerEl.textContent).toContain('75%');
    expect(tab.containerEl.querySelector('.getnote-quota-banner')).not.toBeNull();
  });
});
