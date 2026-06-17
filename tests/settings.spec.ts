import { describe, it, expect, vi, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { App } from 'obsidian';
import { fetchNotes } from '../src/api';
import { initI18n } from '../src/i18n';
import { SettingsComponent } from '../src/settings';
import { DEFAULT_SETTINGS, type Settings } from '../src/types';

vi.mock('../src/api', () => ({
  fetchNotes: vi.fn().mockResolvedValue({ notes: [], hasMore: false }),
  fetchOAuthDeviceCode: vi.fn(),
  pollOAuthToken: vi.fn(),
}));

function makeSettings(overrides: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync },
    syncHistory: [],
    ...overrides,
  };
}

function renderSettings(
  settings: Settings,
  updateSetting = vi.fn(),
  openLocalUpload = vi.fn(),
  options: {
    isSyncing?: boolean;
    syncProgress?: { message: string; count: string; percent: number };
    startSubscribedKnowledgeSync?: () => void;
    initialKnowledgeBaseCache?: { entries: Array<{ topicId: string; name: string }>; cacheUpdatedAt?: number };
  } = {}
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  render(
    h(SettingsComponent, {
      settings,
      updateSetting,
      startSync: vi.fn(),
      isSyncing: options.isSyncing ?? false,
      openNotePicker: vi.fn(),
      startSubscribedKnowledgeSync: options.startSubscribedKnowledgeSync ?? vi.fn(),
      openLocalUpload,
      startAutoSync: vi.fn(),
      stopAutoSync: vi.fn(),
      cancelSync: vi.fn(),
      app: new App(),
      syncProgress: options.syncProgress,
      initialKnowledgeBaseCache: options.initialKnowledgeBaseCache,
    }),
    container
  );
  return { container, updateSetting, openLocalUpload };
}

/**
 * Stateful renderSettings variant for tests that exercise the attachment
 * master toggle. With the declarative Toggle pattern, the visual child state
 * is derived from `settings.attachmentImport` on every render — so a no-op
 * vi.fn() updateSetting would leave the DOM out of sync. This helper holds
 * the settings object in a closure-level mutable ref, mutates it in response
 * to updateSetting calls, and re-renders so children pick up the new value.
 */
function renderStatefulSettings(
  initial: Settings,
  options: Parameters<typeof renderSettings>[3] = {}
): { container: HTMLElement; settings: Settings; updateSetting: ReturnType<typeof vi.fn> } {
  const settings: Settings = JSON.parse(JSON.stringify(initial));
  const container = document.createElement('div');
  document.body.appendChild(container);

  const rerender = () => {
    render(
      h(SettingsComponent, {
        settings,
        updateSetting: updateSetting as unknown as <K extends keyof Settings>(key: K, value: Settings[K]) => void,
        startSync: vi.fn(),
        isSyncing: options.isSyncing ?? false,
        openNotePicker: vi.fn(),
        startSubscribedKnowledgeSync: options.startSubscribedKnowledgeSync ?? vi.fn(),
        openLocalUpload: vi.fn(),
        startAutoSync: vi.fn(),
        stopAutoSync: vi.fn(),
        cancelSync: vi.fn(),
        app: new App(),
        syncProgress: options.syncProgress,
        initialKnowledgeBaseCache: options.initialKnowledgeBaseCache,
      }),
      container
    );
  };

  const updateSetting = vi.fn(<K extends keyof Settings>(key: K, value: Settings[K]) => {
    (settings as unknown as Record<string, unknown>)[key] = value as unknown;
    rerender();
  });

  rerender();
  return { container, settings, updateSetting };
}

function inputValue(input: Element, value: string) {
  (input as HTMLInputElement).value = value;
  input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: value }));
}

function getTestConnectionButton(container: HTMLElement): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button'))
    .find((item): item is HTMLButtonElement => item.textContent === '测试连接');
  expect(button).toBeTruthy();
  return button;
}

function mockOpenExternal() {
  const openExternal = vi.fn();
  (window as Window & {
    require?: (moduleName: 'electron') => { shell: { openExternal: typeof openExternal } };
  }).require = vi.fn(() => ({ shell: { openExternal } }));
  return openExternal;
}

afterEach(() => {
  vi.mocked(fetchNotes).mockClear();
  initI18n('zh-CN');
  render(null, document.body);
  document.body.innerHTML = '';
  delete (window as Window & { require?: unknown }).require;
});

describe('SettingsComponent auth credentials', () => {
  it('keeps the tag whitelist editable when scheduled sync is disabled', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: false },
      tagCache: { tags: ['AI', '管理'], cacheUpdatedAt: Date.now() },
    }));

    expect(container.textContent).toContain('同步范围');
    const trigger = container.querySelector('.getnote-tag-select-trigger') as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const option = Array.from(container.querySelectorAll('.getnote-tag-select-option'))
      .find(label => label.textContent === 'AI') as HTMLLabelElement;
    expect(option).toBeTruthy();
    const checkbox = option.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(() => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('syncTags', ['AI']);
  });

  it('renders the exhausted quota warning inside the scheduled sync controls', () => {
    const { container } = renderSettings(makeSettings({
      lastQuotaState: { exhausted: true, reason: 'quota_day', checkedAt: Date.now() },
    }));

    const banner = container.querySelector('.getnote-quota-banner');
    expect(banner).not.toBeNull();
    expect(banner!.closest('.setting-item-control')).not.toBeNull();
  });

  it('opens knowledge-base sync from the OpenAPI manual download actions', async () => {
    const startSubscribedKnowledgeSync = vi.fn();
    const { container } = renderSettings(makeSettings({
      authMode: 'openapi',
      openApiToken: 'openapi-token',
      openApiClientId: 'openapi-client',
      apiToken: 'openapi-token',
      clientId: 'openapi-client',
    }), vi.fn(), vi.fn(), { startSubscribedKnowledgeSync });

    const button = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '按知识库同步');
    expect(button).toBeTruthy();
    expect(button!.disabled).toBe(false);

    await act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(startSubscribedKnowledgeSync).toHaveBeenCalledTimes(1);
  });

  it('hides knowledge-base sync in Web API mode', () => {
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: 'web-token',
      apiToken: 'web-token',
    }));

    expect(container.textContent).not.toContain('按知识库同步');
  });

  it('does not render a separate upload permission switch', () => {
    const { container } = renderSettings(makeSettings({
      reverseSync: { enabled: false },
    }));

    expect(container.textContent).not.toContain('允许上传本地笔记到得到大脑');
    expect(container.textContent).not.toContain('启用上传');
  });

  it('opens the local upload picker from the manual sync upload button', async () => {
    const openLocalUpload = vi.fn();
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: 'web-token',
      apiToken: 'web-token',
      reverseSync: { enabled: false },
    }), vi.fn(), openLocalUpload);

    expect(container.textContent).toContain('从得到大脑下载至 Obsidian');
    expect(container.textContent).toContain('从 Obsidian 上传至得到大脑');
    expect(container.textContent).not.toContain('选择笔记上传');
    const uploadButton = Array.from(container.querySelectorAll('button'))
      .find((button): button is HTMLButtonElement => button.textContent === '按笔记上传');
    expect(uploadButton).toBeTruthy();
    expect(uploadButton!.disabled).toBe(false);
    expect(uploadButton!.classList.contains('mod-secondary')).toBe(true);

    await act(() => {
      uploadButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(openLocalUpload).toHaveBeenCalledTimes(1);
  });

  it('disables the local upload button until credentials are configured', () => {
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: '',
      apiToken: '',
      reverseSync: { enabled: true },
    }));

    const uploadButton = Array.from(container.querySelectorAll('button'))
      .find((button): button is HTMLButtonElement => button.textContent === '按笔记上传');
    expect(uploadButton).toBeTruthy();
    expect(uploadButton!.disabled).toBe(true);
  });

  it('disables the local upload button while syncing', () => {
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: 'web-token',
      apiToken: 'web-token',
    }), vi.fn(), vi.fn(), { isSyncing: true });

    const uploadButton = Array.from(container.querySelectorAll('button'))
      .find((button): button is HTMLButtonElement => button.textContent === '按笔记上传');
    expect(uploadButton).toBeTruthy();
    expect(uploadButton!.disabled).toBe(true);
  });

  it('keeps the syncing progress block visible when upload progress changes', async () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const settings = makeSettings({
        authMode: 'web',
        webApiToken: 'web-token',
        apiToken: 'web-token',
      });
      const { container } = renderSettings(settings, vi.fn(), vi.fn(), {
        isSyncing: true,
        syncProgress: { message: '正在上传到得到大脑...', count: '处理中 1 条...', percent: 50 },
      });

      await act(async () => {
        render(
          h(SettingsComponent, {
            settings,
            updateSetting: vi.fn(),
            startSync: vi.fn(),
            isSyncing: true,
            openNotePicker: vi.fn(),
            startSubscribedKnowledgeSync: vi.fn(),
            openLocalUpload: vi.fn(),
            startAutoSync: vi.fn(),
            stopAutoSync: vi.fn(),
            cancelSync: vi.fn(),
            app: new App(),
            syncProgress: { message: '正在上传到得到大脑...', count: '处理中 2 条...', percent: 100 },
          }),
          container
        );
      });

      expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest', behavior: 'smooth' });
    } finally {
      Element.prototype.scrollIntoView = originalScrollIntoView;
    }
  });

  it('writes the visible mode token back when switching auth modes', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      authMode: 'openapi',
      apiToken: '',
      clientId: 'cli-openapi',
      openApiToken: '',
      openApiClientId: 'cli-openapi',
      webApiToken: '',
    }));

    const tokenInput = container.querySelector('input[type="password"]');
    expect(tokenInput).not.toBeNull();
    await act(() => {
      inputValue(tokenInput!, 'gk-openapi-token');
    });
    expect(updateSetting).toHaveBeenCalledWith('openApiToken', 'gk-openapi-token');

    const webRadio = container.querySelector('input[value="web"]');
    expect(webRadio).not.toBeNull();
    await act(() => {
      webRadio!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const webTokenInput = container.querySelector('input[type="password"]');
    expect(webTokenInput).not.toBeNull();
    await act(() => {
      inputValue(webTokenInput!, 'web-session-token');
    });
    expect(updateSetting).toHaveBeenCalledWith('webApiToken', 'web-session-token');

    const openapiRadio = container.querySelector('input[value="openapi"]');
    expect(openapiRadio).not.toBeNull();
    await act(() => {
      openapiRadio!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('apiToken', 'gk-openapi-token');
    expect(updateSetting).toHaveBeenCalledWith('clientId', 'cli-openapi');
  });

  it('runs the OpenAPI test-connection chain with OpenAPI credentials', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      authMode: 'openapi',
      apiToken: '',
      clientId: '',
      openApiToken: '',
      openApiClientId: '',
      webApiToken: 'web-token',
    }));

    const clientIdInput = container.querySelector('input[placeholder="Client ID：cli_xxx"]');
    const tokenInput = container.querySelector('input[type="password"]');
    expect(clientIdInput).not.toBeNull();
    expect(tokenInput).not.toBeNull();

    await act(() => {
      inputValue(clientIdInput!, 'cli-openapi');
      inputValue(tokenInput!, 'gk-openapi-token');
    });

    expect(updateSetting).toHaveBeenCalledWith('openApiClientId', 'cli-openapi');
    expect(updateSetting).toHaveBeenCalledWith('openApiToken', 'gk-openapi-token');

    await act(async () => {
      getTestConnectionButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchNotes).toHaveBeenCalledWith(expect.objectContaining({
      token: 'gk-openapi-token',
      clientId: 'cli-openapi',
      authMode: 'openapi',
      sinceId: '0',
      limit: 1,
    }));
  });

  it('runs the Web Token test-connection chain with Web credentials', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      authMode: 'web',
      apiToken: '',
      clientId: 'cli-openapi',
      openApiToken: 'gk-openapi-token',
      openApiClientId: 'cli-openapi',
      webApiToken: '',
    }));

    const tokenInput = container.querySelector('input[type="password"]');
    expect(tokenInput).not.toBeNull();

    await act(() => {
      inputValue(tokenInput!, 'web-session-token');
    });

    expect(updateSetting).toHaveBeenCalledWith('webApiToken', 'web-session-token');

    await act(async () => {
      getTestConnectionButton(container).dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await Promise.resolve();
    });

    expect(fetchNotes).toHaveBeenCalledWith(expect.objectContaining({
      token: 'web-session-token',
      clientId: '',
      authMode: 'web',
      sinceId: '0',
      limit: 1,
    }));
  });

  it('shows concise temporary-auth guidance in Web auth mode', () => {
    initI18n('en-US');
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: '',
    }));

    expect(container.textContent).toContain('Temporary Auth');
    expect(container.textContent).toContain('about 30 minutes');
    expect(container.textContent).toContain('PRO');
    expect(container.textContent).toContain('OpenAPI');
    expect(container.textContent).not.toContain('DevTools');
    expect(container.textContent).not.toContain('Network');
    expect(container.textContent).not.toContain('Fetch/XHR');
  });

  it('uses Chinese README links in Chinese locale', () => {
    initI18n('zh-CN');
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: 'web-token',
    }));

    const links = Array.from(container.querySelectorAll('a')).map((link) => link.href);
    expect(links.some((href) => href.includes('README.md#%E5%85%B3%E4%BA%8E%E4%BD%9C%E8%80%85') || href.includes('README.md#关于作者'))).toBe(true);
    expect(links.some((href) => href.includes('docs/web-mode-manual-token_zh.md'))).toBe(true);
  });

  it('opens settings documentation links in the external browser', async () => {
    initI18n('zh-CN');
    const openExternal = mockOpenExternal();
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: 'web-token',
    }));

    const communityLink = Array.from(container.querySelectorAll('a'))
      .find((link): link is HTMLAnchorElement => link.textContent === '欢迎交流、留下star');
    const helpLink = Array.from(container.querySelectorAll('a'))
      .find((link): link is HTMLAnchorElement => link.textContent === '查看图文步骤');
    expect(communityLink).toBeTruthy();
    expect(helpLink).toBeTruthy();

    await act(() => {
      communityLink!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      helpLink!.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(openExternal).toHaveBeenCalledWith(expect.stringContaining('README.md'));
    expect(openExternal).toHaveBeenCalledWith(expect.stringContaining('docs/web-mode-manual-token_zh.md'));
  });

  it('uses English README links in English locale', () => {
    initI18n('en-US');
    const { container } = renderSettings(makeSettings({
      authMode: 'web',
      webApiToken: 'web-token',
    }));

    const links = Array.from(container.querySelectorAll('a')).map((link) => link.href);
    expect(links.some((href) => href.includes('README_EN.md#about-the-author'))).toBe(true);
    expect(links.some((href) => href.includes('docs/web-mode-manual-token.md'))).toBe(true);
  });

  it('renders a reset button next to the last sync checkpoint', () => {
    const { container } = renderSettings(makeSettings({
      syncStartDate: '2026-01-01',
      lastSyncEndTimestamp: '2026-06-12T15:30:00+08:00',
    }));

    const row = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('上次同步断点'));
    expect(row).toBeTruthy();
    // The checkpoint is rendered in the viewer's local timezone via toLocaleString.
    // The original +08:00 input is converted to local time; we compare against the
    // same conversion so the test is timezone-independent.
    const expectedLocal = new Date('2026-06-12T15:30:00+08:00').toLocaleString();
    expect(row!.textContent).toContain(expectedLocal);

    const resetButton = Array.from(row!.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '重置');
    expect(resetButton).toBeTruthy();
  });

  it('renders a UTC checkpoint in the local timezone and includes the timezone abbreviation', () => {
    // 2026-06-12T15:30:00Z (UTC) — toLocaleString should convert to local time
    // and include a timezone abbreviation (e.g. "GMT+8" for zh-CN, "PDT" for en-US, etc.).
    // The original bug stripped the timezone info entirely, so any output containing a
    // timezone abbreviation is the contract under test.
    const utcIso = '2026-06-12T15:30:00Z';
    const expectedLocal = new Date(utcIso).toLocaleString();

    const { container } = renderSettings(makeSettings({
      syncStartDate: '2026-01-01',
      lastSyncEndTimestamp: utcIso,
    }));

    const row = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('上次同步断点'));
    expect(row).toBeTruthy();
    // The displayed text must equal the local-time conversion of the UTC ISO.
    expect(row!.textContent).toContain(expectedLocal);
    // Must NOT silently strip the timezone — the rendered text must include a
    // timezone abbreviation produced by toLocaleString (e.g. "GMT+8", "UTC",
    // "CST", "JST" depending on the test environment's locale).
    const tzAbbrevPattern = /(GMT[+\-]\d+|UTC|CST|JST|EST|EDT|PST|PDT|UTC[+\-]\d+)/;
    expect(row!.textContent).toMatch(tzAbbrevPattern);
  });

  it('reveals the inline start date editor when the reset button is clicked', async () => {
    const { container } = renderSettings(makeSettings({
      syncStartDate: '2026-01-01',
      lastSyncEndTimestamp: '2026-06-12T15:30:00+08:00',
    }));

    const resetButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '重置');
    expect(resetButton).toBeTruthy();

    await act(() => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // Label switches to "同步起始日期", date input becomes editable, and Save/Cancel buttons appear
    const editorRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('同步起始日期'));
    expect(editorRow).toBeTruthy();
    const dateInput = editorRow!.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();
    expect(dateInput.value).toBe('2026-01-01');
    expect(dateInput.readOnly).toBe(false);

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '保存');
    const cancelButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '取消');
    expect(saveButton).toBeTruthy();
    expect(cancelButton).toBeTruthy();
  });

  it('clears lastSyncEndTimestamp and updates syncStartDate when the reset editor saves', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      syncStartDate: '2026-01-01',
      lastSyncEndTimestamp: '2026-06-12T15:30:00+08:00',
    }));

    const resetButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '重置');
    await act(() => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editorRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('同步起始日期'));
    const dateInput = editorRow!.querySelector('input[type="date"]') as HTMLInputElement;
    await act(() => {
      dateInput.value = '2025-08-01';
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '保存');
    await act(() => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('lastSyncEndTimestamp', '');
    expect(updateSetting).toHaveBeenCalledWith('syncStartDate', '2025-08-01');
  });

  it('rejects an empty start date in the reset editor and keeps the previous syncStartDate', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      syncStartDate: '2026-01-01',
      lastSyncEndTimestamp: '2026-06-12T15:30:00+08:00',
    }));

    const resetButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '重置');
    await act(() => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editorRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('同步起始日期'));
    const dateInput = editorRow!.querySelector('input[type="date"]') as HTMLInputElement;
    await act(() => {
      // User clears the date input — pendingStartDate is now ''.
      dateInput.value = '';
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const saveButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '保存');
    await act(() => {
      saveButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    // The previous syncStartDate ('2026-01-01') must NOT be overwritten with an
    // empty string — the original bug silently fell back to maxDays (default 30
    // days). The fix is to refuse the save when the input is empty so the
    // existing value remains intact.
    expect(updateSetting).not.toHaveBeenCalledWith('syncStartDate', '');
    expect(updateSetting).not.toHaveBeenCalledWith('syncStartDate', '2026-01-01');
  });

  it('discards changes when the reset editor is cancelled', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      syncStartDate: '2026-01-01',
      lastSyncEndTimestamp: '2026-06-12T15:30:00+08:00',
    }));

    const resetButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '重置');
    await act(() => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editorRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('同步起始日期'));
    const dateInput = editorRow!.querySelector('input[type="date"]') as HTMLInputElement;
    await act(() => {
      dateInput.value = '2025-08-01';
      dateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const cancelButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '取消');
    await act(() => {
      cancelButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateSetting).not.toHaveBeenCalledWith('lastSyncEndTimestamp', '');
    expect(updateSetting).not.toHaveBeenCalledWith('syncStartDate', '2025-08-01');

    // UI returns to state A
    const checkpointRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('上次同步断点'));
    expect(checkpointRow).toBeTruthy();
    const expectedLocal = new Date('2026-06-12T15:30:00+08:00').toLocaleString();
    expect(checkpointRow!.textContent).toContain(expectedLocal);
  });

  it('uses the previous syncStartDate as the default value when reset is clicked', async () => {
    const { container } = renderSettings(makeSettings({
      syncStartDate: '2025-12-15',
      lastSyncEndTimestamp: '2026-06-12T15:30:00+08:00',
    }));

    const resetButton = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '重置');
    await act(() => {
      resetButton!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const editorRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(node => node.textContent?.includes('同步起始日期'));
    const dateInput = editorRow!.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput.value).toBe('2025-12-15');
  });

  it('renders the attachment download section with a master toggle and four child toggles', async () => {
    const settings = makeSettings();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(SettingsComponent, {
          settings,
          updateSetting: vi.fn(),
          startSync: vi.fn(),
          isSyncing: false,
          openNotePicker: vi.fn(),
          startSubscribedKnowledgeSync: vi.fn(),
          openLocalUpload: vi.fn(),
          startAutoSync: vi.fn(),
          stopAutoSync: vi.fn(),
          cancelSync: vi.fn(),
          app: new App(),
        }),
        container
      );
    });
    await new Promise(r => setTimeout(r, 50));

    const sectionName = container.querySelector('.setting-item-name');
    expect(container.textContent).toContain('附件下载配置');

    const toggleEls = container.querySelectorAll('.setting-item .checkbox-container');
    // 5 toggles total: 1 master + image + audio + video + document
    expect(toggleEls.length).toBeGreaterThanOrEqual(5);
  });

  it('keeps attachment child toggles collapsed behind a compact disclosure', async () => {
    const { container } = renderSettings(makeSettings());
    await new Promise(r => setTimeout(r, 50));

    const detail = container.querySelector('.getnote-scheduled-options-detail');
    expect(detail).toBeTruthy();
    const disclosure = container.querySelector('.getnote-attachment-master-row .getnote-inline-disclosure') as HTMLButtonElement;
    expect(disclosure).toBeTruthy();
    expect(detail!.classList.contains('getnote-hidden')).toBe(true);
    await act(() => {
      disclosure.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(detail!.classList.contains('getnote-hidden')).toBe(false);
    expect(detail!.querySelectorAll('.getnote-nested-row').length).toBe(4);
  });

  it('flips all four child toggles when the master attachment toggle is clicked', async () => {
    const { container, updateSetting } = renderStatefulSettings(makeSettings({
      attachmentImport: { image: true, audio: true, video: true, document: true },
    }));
    await new Promise(r => setTimeout(r, 50));

    const masterRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(row => row.textContent?.includes('下载附件'));
    expect(masterRow).toBeTruthy();

    const masterToggle = masterRow!.querySelector('.checkbox-container');
    expect(masterToggle).toBeTruthy();

    await act(() => {
      masterToggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('attachmentImport', {
      image: false,
      audio: false,
      video: false,
      document: false,
    });
    const childToggles = Array.from(container.querySelectorAll('.getnote-attachment-options .checkbox-container'));
    expect(childToggles.every(toggle => !toggle.classList.contains('is-enabled'))).toBe(true);
  });

  it('enables all child toggles when a mixed attachment master is clicked', async () => {
    const { container, updateSetting } = renderStatefulSettings(makeSettings({
      attachmentImport: { image: true, audio: false, video: true, document: false },
    }));

    await new Promise(r => setTimeout(r, 50));
    const masterRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(row => row.textContent?.includes('下载附件'));
    const masterToggle = masterRow!.querySelector('.checkbox-container')!;

    await act(() => {
      masterToggle.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('attachmentImport', {
      image: true,
      audio: true,
      video: true,
      document: true,
    });
    const childToggles = Array.from(container.querySelectorAll('.getnote-attachment-options .checkbox-container'));
    expect(childToggles.every(toggle => toggle.classList.contains('is-enabled'))).toBe(true);
  });

  it('disables child attachment toggles when the master is off', async () => {
    const updateSetting = vi.fn();
    const settings = makeSettings({
      attachmentImport: { image: true, audio: false, video: true, document: false },
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => {
      render(
        h(SettingsComponent, {
          settings,
          updateSetting,
          startSync: vi.fn(),
          isSyncing: false,
          openNotePicker: vi.fn(),
          startSubscribedKnowledgeSync: vi.fn(),
          openLocalUpload: vi.fn(),
          startAutoSync: vi.fn(),
          stopAutoSync: vi.fn(),
          cancelSync: vi.fn(),
          app: new App(),
        }),
        container
      );
    });
    await new Promise(r => setTimeout(r, 50));

    const audioRow = Array.from(container.querySelectorAll('.getnote-scheduled-row'))
      .find(row => row.textContent?.includes('音频'));
    expect(audioRow).toBeTruthy();
    const audioToggle = audioRow!.querySelector('.checkbox-container');
    expect(audioToggle).toBeTruthy();
    expect(audioToggle!.classList.contains('is-enabled')).toBe(false);
    expect(audioToggle!.classList.contains('is-disabled')).toBe(true);

    await act(() => {
      audioToggle!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateSetting).not.toHaveBeenCalledWith('attachmentImport', expect.anything());
  });

  it('stores note type filters inside scheduled sync settings', async () => {
    const scheduledSync = {
      ...DEFAULT_SETTINGS.scheduledSync,
      enabled: true,
    };
    const { container, updateSetting } = renderSettings(makeSettings({
      scheduledSync,
    }));

    const trigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部笔记');
    expect(trigger).toBeTruthy();
    await act(() => {
      trigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const plainTextOption = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === '文字笔记');
    expect(plainTextOption).toBeTruthy();
    const checkbox = plainTextOption!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    await act(() => {
      checkbox.checked = false;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).not.toHaveBeenCalledWith('enabledNoteTypes', expect.anything());
    expect(updateSetting).toHaveBeenCalledWith('scheduledSync', expect.objectContaining({
      ...scheduledSync,
      enabledNoteTypes: expect.arrayContaining(['immediate_audio', 'recorder_audio', 'audio_long', 'local_audio', 'audio', 'class_audio', 'recorder_flash_audio', 'internal_record', 'meeting', 'link', 'img_text', 'blogger_post']),
    }));
  });

  it('renders note type and tag filters inside scheduled sync controls', () => {
    const { container } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: true },
      maxDays: 14,
    }));

    const noteTypeLabel = Array.from(container.querySelectorAll('.getnote-scheduled-row-label'))
      .find(node => node.textContent === '同步笔记类型');
    const tagLabel = Array.from(container.querySelectorAll('.getnote-scheduled-row-label'))
      .find(node => node.textContent === '同步范围');

    expect(noteTypeLabel).toBeTruthy();
    expect(noteTypeLabel!.closest('.getnote-scheduled-rows')).not.toBeNull();
    expect(tagLabel).toBeTruthy();
    expect(tagLabel!.closest('.getnote-scheduled-rows')).not.toBeNull();
  });

  it('keeps scheduled sync details collapsed and does not render auto sync range there', async () => {
    const { container } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: true },
      maxDays: 30,
    }));

    const disclosure = container.querySelector('.getnote-scheduled-row .getnote-inline-disclosure') as HTMLButtonElement;
    expect(disclosure).toBeTruthy();
    const details = container.querySelector('.getnote-scheduled-rows');
    expect(details).toBeTruthy();
    expect(details!.classList.contains('getnote-hidden')).toBe(true);
    await act(() => {
      disclosure.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(details!.classList.contains('getnote-hidden')).toBe(false);
    expect(container.textContent).not.toContain('自动同步范围');
  });

  it('renders the knowledge-base dropdown inside scheduled sync controls', () => {
    const { container } = renderSettings(makeSettings({
      scheduledSync: {
        ...DEFAULT_SETTINGS.scheduledSync,
        enabled: true,
        syncKnowledgeBases: ['kb-1'],
      },
    }));

    const labelNode = Array.from(container.querySelectorAll('span'))
      .find(node => node.textContent === '允许同步知识库');
    expect(labelNode).toBeTruthy();
    expect(labelNode!.closest('.getnote-scheduled-row')).not.toBeNull();
  });

  it('stores the selected knowledge bases inside scheduled sync settings', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: true },
    }), vi.fn(), vi.fn(), {
      initialKnowledgeBaseCache: {
        entries: [{ topicId: 'kb-test', name: '测试知识库' }],
      },
    });

    const trigger = Array.from(container.querySelectorAll('.getnote-knowledge-base-select-trigger'))[0] as HTMLButtonElement;
    expect(trigger).toBeTruthy();
    await act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const kbOption = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === '测试知识库');
    expect(kbOption).toBeTruthy();
    const checkbox = kbOption!.querySelector('input[type="checkbox"]') as HTMLInputElement;

    await act(() => {
      checkbox.checked = true;
      checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('scheduledSync', expect.objectContaining({
      syncKnowledgeBases: ['kb-test'],
    }));
  });

  it('keeps the sync history button compact', () => {
    const { container } = renderSettings(makeSettings());
    const button = Array.from(container.querySelectorAll('button'))
      .find((item): item is HTMLButtonElement => item.textContent === '查看日志');
    expect(button).toBeTruthy();
    expect(button!.classList.contains('getnote-view-history-btn')).toBe(true);
  });
});

describe('SettingsComponent scheduled sync toggles (#136)', () => {
  function findScheduledEnabledRow(container: HTMLElement): HTMLElement {
    const rows = container.querySelectorAll('.getnote-scheduled-row');
    const row = Array.from(rows).find((el) => el.textContent === '启用定时同步');
    expect(row).toBeTruthy();
    return row!;
  }

  function findSyncOnStartRow(container: HTMLElement): HTMLElement {
    const rows = container.querySelectorAll('.getnote-scheduled-row');
    const row = Array.from(rows).find((el) => el.textContent?.includes('启动时同步'));
    expect(row).toBeTruthy();
    return row!;
  }

  it('renders scheduledEnabled as an Obsidian toggle (not a plain checkbox)', () => {
    const { container } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: false },
    }));

    const row = findScheduledEnabledRow(container);
    const toggleContainers = row.querySelectorAll('.checkbox-container');
    const plainCheckboxes = row.querySelectorAll(':scope > input[type="checkbox"]');

    expect(toggleContainers.length).toBe(1);
    expect(plainCheckboxes.length).toBe(0);
    const innerCheckbox = toggleContainers[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(innerCheckbox).toBeTruthy();
    expect(innerCheckbox.checked).toBe(false);
  });

  it('renders syncOnStart as an Obsidian toggle inside the scheduled sync options', () => {
    const { container } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: true, syncOnStart: true },
    }));

    const row = findSyncOnStartRow(container);
    const toggleContainers = row.querySelectorAll('.checkbox-container');
    const plainCheckboxes = row.querySelectorAll(':scope > input[type="checkbox"]');

    expect(toggleContainers.length).toBe(1);
    expect(plainCheckboxes.length).toBe(0);
    const innerCheckbox = toggleContainers[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(innerCheckbox).toBeTruthy();
    expect(innerCheckbox.checked).toBe(true);
    expect(toggleContainers[0].classList.contains('is-enabled')).toBe(true);
  });

  it('preserves onChange behavior for scheduledEnabled toggle', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: false },
    }));

    const row = findScheduledEnabledRow(container);
    const innerCheckbox = row.querySelector('.checkbox-container input[type="checkbox"]') as HTMLInputElement;
    expect(innerCheckbox).toBeTruthy();

    await act(() => {
      innerCheckbox.checked = true;
      innerCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('scheduledSync', expect.objectContaining({
      enabled: true,
    }));
    expect(row.querySelector('.checkbox-container')?.classList.contains('is-enabled')).toBe(true);
  });

  it('toggles scheduled sync when clicking the Obsidian switch container', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: false },
    }));

    const row = findScheduledEnabledRow(container);
    const switchContainer = row.querySelector('.checkbox-container') as HTMLElement;
    expect(switchContainer).toBeTruthy();

    await act(() => {
      switchContainer.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('scheduledSync', expect.objectContaining({
      enabled: true,
    }));
    expect(switchContainer.classList.contains('is-enabled')).toBe(true);
  });

  it('preserves onChange behavior for syncOnStart toggle', async () => {
    const { container, updateSetting } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: true, syncOnStart: false },
    }));

    const row = findSyncOnStartRow(container);
    const innerCheckbox = row.querySelector('.checkbox-container input[type="checkbox"]') as HTMLInputElement;
    expect(innerCheckbox).toBeTruthy();

    await act(() => {
      innerCheckbox.checked = true;
      innerCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('scheduledSync', expect.objectContaining({
      enabled: true,
      syncOnStart: true,
    }));
  });
});

describe('SettingsComponent — syncTags (tag whitelist) dropdown', () => {
  it('renders the sync range setting with the tag whitelist dropdown', () => {
    const { container } = renderSettings(makeSettings({
      scheduledSync: { ...DEFAULT_SETTINGS.scheduledSync, enabled: true },
      syncTags: ['work', 'project'],
      tagCache: { tags: ['work', 'project', 'daily'], lastUpdated: Date.now() },
    }));

    const syncRangeLabel = Array.from(container.querySelectorAll('.getnote-scheduled-row-label'))
      .find(node => node.textContent === '同步范围');
    expect(syncRangeLabel).toBeTruthy();
    expect(syncRangeLabel!.closest('.getnote-scheduled-rows')).not.toBeNull();
    const tagTrigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '已选 2 项');
    expect(tagTrigger).toBeTruthy();
  });

  it('shows "All tags" label when syncTags is empty', () => {
    const { container } = renderSettings(makeSettings({
      syncTags: [],
      tagCache: { tags: ['work', 'daily'], lastUpdated: Date.now() },
    }));

    const tagTrigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部标签');
    expect(tagTrigger).toBeTruthy();
  });

  it('calls updateSetting with syncTags when the dropdown selection changes', async () => {
    const updateSetting = vi.fn();
    const { container } = renderSettings(makeSettings({
      syncTags: [],
      tagCache: { tags: ['work', 'daily'], lastUpdated: Date.now() },
    }), updateSetting);

    const tagTrigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部标签');
    expect(tagTrigger).toBeTruthy();
    await act(() => {
      tagTrigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const workOption = Array.from(container.querySelectorAll('label'))
      .find(label => label.textContent === 'work');
    expect(workOption).toBeTruthy();
    const workCheckbox = workOption!.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(() => {
      workCheckbox.checked = true;
      workCheckbox.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(updateSetting).toHaveBeenCalledWith('syncTags', ['work']);
  });

  it('supports fuzzy search in the dropdown to filter options', async () => {
    const { container } = renderSettings(makeSettings({
      syncTags: [],
      tagCache: { tags: ['work', 'project', 'personal', 'health'], lastUpdated: Date.now() },
    }));

    const tagTrigger = Array.from(container.querySelectorAll('button'))
      .find(button => button.textContent === '全部标签');
    expect(tagTrigger).toBeTruthy();
    await act(() => {
      tagTrigger!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const searchInput = container.querySelector('.getnote-tag-select-search input') as HTMLInputElement;
    expect(searchInput).toBeTruthy();
    await act(() => {
      searchInput.value = 'wo';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(container.textContent).toContain('work');
    expect(container.textContent).not.toContain('project');
    expect(container.textContent).not.toContain('personal');
    expect(container.textContent).not.toContain('health');
  });
});
