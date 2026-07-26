import { Window } from 'happy-dom';
import { App, Modal } from 'obsidian';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import GetNoteSyncPlugin from '../src/main';
import { DEFAULT_SETTINGS } from '../src/types';
import { NoteTypeSelect } from '../src/ui/note-type-select';

const originalSetText = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'setText');
const originalOnWindowMigrated = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onWindowMigrated');
const windowMigrationListeners = new WeakMap<HTMLElement, Set<(win: globalThis.Window) => void>>();

afterEach(() => {
  vi.restoreAllMocks();
  render(null, document.body);
  document.body.innerHTML = '';
  Object.assign(globalThis, { activeDocument: document, activeWindow: window });
  if (originalSetText) {
    Object.defineProperty(HTMLElement.prototype, 'setText', originalSetText);
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).setText;
  }
  if (originalOnWindowMigrated) {
    Object.defineProperty(HTMLElement.prototype, 'onWindowMigrated', originalOnWindowMigrated);
  } else {
    delete (HTMLElement.prototype as Partial<HTMLElement>).onWindowMigrated;
  }
});

function createPopout() {
  const popoutWindow = new Window({ url: 'https://getnote.test/popout' });
  const container = popoutWindow.document.createElement('div');
  popoutWindow.document.body.appendChild(container);
  return { popoutWindow, container };
}

function openSelect(popoutWindow: Window, container: HTMLElement, index = 0) {
  const trigger = container.querySelectorAll<HTMLButtonElement>('.getnote-note-type-select-trigger')[index];
  trigger.dispatchEvent(new popoutWindow.MouseEvent('click', { bubbles: true }));
}

function installWindowMigrationHook() {
  Object.defineProperty(HTMLElement.prototype, 'onWindowMigrated', {
    configurable: true,
    value(this: HTMLElement, listener: (win: globalThis.Window) => void) {
      const listeners = windowMigrationListeners.get(this) ?? new Set();
      listeners.add(listener);
      windowMigrationListeners.set(this, listeners);
      return () => listeners.delete(listener);
    },
  });
}

function migrateToPopout(popoutWindow: Window, container: HTMLElement) {
  const selectRoots = Array.from(container.querySelectorAll<HTMLElement>('.getnote-note-type-select'));
  popoutWindow.document.adoptNode(container);
  popoutWindow.document.body.appendChild(container);
  for (const root of selectRoots) {
    for (const listener of windowMigrationListeners.get(root) ?? []) {
      listener(popoutWindow as unknown as globalThis.Window);
    }
  }
}

describe('floating select menu behavior', () => {
  it('keeps one floating select open in the main window', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(
      h('div', {}, [
        h(NoteTypeSelect, { onChange: vi.fn() }),
        h(NoteTypeSelect, { onChange: vi.fn() }),
      ]),
      container
    );

    const triggers = Array.from(container.querySelectorAll('.getnote-note-type-select-trigger')) as HTMLButtonElement[];

    await act(() => {
      triggers[0].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelectorAll('.getnote-note-type-select-menu')).toHaveLength(1);

    await act(() => {
      triggers[1].dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    const menus = Array.from(container.querySelectorAll('.getnote-note-type-select-menu'));
    expect(menus).toHaveLength(1);
    expect(triggers[0].querySelector('.is-open')).toBeNull();
    expect(triggers[1].querySelector('.is-open')).toBeTruthy();
  });

  it('closes an open floating select on outside mouse down in the main window', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(h(NoteTypeSelect, { onChange: vi.fn() }), container);

    await act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.getnote-note-type-select-menu')).toBeTruthy();

    await act(() => {
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBeNull();
  });

  it('opens and selects an option in a popout window realm', async () => {
    const { popoutWindow, container } = createPopout();
    const onChange = vi.fn();
    render(h(NoteTypeSelect, { onChange }), container);

    await act(() => openSelect(popoutWindow, container));
    const plainText = container.querySelector<HTMLInputElement>(
      '.getnote-note-type-select-option:nth-child(2) input'
    );
    expect(plainText).toBeTruthy();

    await act(() => {
      plainText!.checked = false;
      plainText!.dispatchEvent(new popoutWindow.Event('change', { bubbles: true }));
    });

    expect(onChange).toHaveBeenCalledWith(expect.not.arrayContaining(['plain_text']));
    render(null, container);
    popoutWindow.close();
  });

  it('closes an open floating select on outside mouse down in its popout document', async () => {
    const { popoutWindow, container } = createPopout();
    render(h(NoteTypeSelect, { onChange: vi.fn() }), container);

    await act(() => openSelect(popoutWindow, container));
    expect(container.querySelector('.getnote-note-type-select-menu')).toBeTruthy();

    await act(() => {
      popoutWindow.document.body.dispatchEvent(new popoutWindow.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBeNull();
    render(null, container);
    popoutWindow.close();
  });

  it('repositions a popout menu on its own resize and capture scroll events', async () => {
    const { popoutWindow, container } = createPopout();
    render(h(NoteTypeSelect, { onChange: vi.fn() }), container);
    const trigger = container.querySelector<HTMLButtonElement>('.getnote-note-type-select-trigger')!;
    let rect = { bottom: 20, left: 10, width: 120 };
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(
      () => ({ ...rect }) as DOMRect
    );

    await act(() => openSelect(popoutWindow, container));
    const menu = container.querySelector<HTMLElement>('.getnote-note-type-select-menu')!;
    expect(menu.style.top).toBe('24px');
    expect(menu.style.left).toBe('10px');
    expect(menu.style.width).toBe('120px');

    rect = { bottom: 40, left: 30, width: 160 };
    await act(() => {
      popoutWindow.dispatchEvent(new popoutWindow.Event('resize'));
    });
    expect(menu.style.top).toBe('44px');
    expect(menu.style.left).toBe('30px');
    expect(menu.style.width).toBe('160px');

    rect = { bottom: 60, left: 50, width: 180 };
    const scrollTarget = popoutWindow.document.createElement('div');
    container.appendChild(scrollTarget);
    await act(() => {
      scrollTarget.dispatchEvent(new popoutWindow.Event('scroll'));
    });
    expect(menu.style.top).toBe('64px');
    expect(menu.style.left).toBe('50px');
    expect(menu.style.width).toBe('180px');

    render(null, container);
    popoutWindow.close();
  });

  it('keeps one floating select open within a popout window', async () => {
    const { popoutWindow, container } = createPopout();
    render(
      h('div', {}, [
        h(NoteTypeSelect, { onChange: vi.fn() }),
        h(NoteTypeSelect, { onChange: vi.fn() }),
      ]),
      container
    );

    await act(() => openSelect(popoutWindow, container, 0));
    await act(() => openSelect(popoutWindow, container, 1));

    const triggers = container.querySelectorAll('.getnote-note-type-select-trigger');
    expect(container.querySelectorAll('.getnote-note-type-select-menu')).toHaveLength(1);
    expect(triggers[0].querySelector('.is-open')).toBeNull();
    expect(triggers[1].querySelector('.is-open')).toBeTruthy();

    render(null, container);
    popoutWindow.close();
  });

  it('ignores main-window coordination, resize, scroll, and outside events for a popout menu', async () => {
    const { popoutWindow, container } = createPopout();
    render(h(NoteTypeSelect, { onChange: vi.fn() }), container);
    const popoutTrigger = container.querySelector<HTMLButtonElement>('.getnote-note-type-select-trigger')!;
    let rect = { bottom: 20, left: 10, width: 120 };
    vi.spyOn(popoutTrigger, 'getBoundingClientRect').mockImplementation(
      () => ({ ...rect }) as DOMRect
    );

    await act(() => openSelect(popoutWindow, container));
    const popoutMenu = container.querySelector<HTMLElement>('.getnote-note-type-select-menu')!;
    expect(popoutMenu.style.top).toBe('24px');

    const mainContainer = document.createElement('div');
    document.body.appendChild(mainContainer);
    render(h(NoteTypeSelect, { onChange: vi.fn() }), mainContainer);
    rect = { bottom: 80, left: 70, width: 200 };
    await act(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
      mainContainer.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBe(popoutMenu);
    expect(popoutMenu.style.top).toBe('24px');
    expect(popoutMenu.style.left).toBe('10px');
    expect(popoutMenu.style.width).toBe('120px');

    render(null, mainContainer);
    render(null, container);
    popoutWindow.close();
  });

  it('closes a popout floating select only when its window owns the command-driven modal', async () => {
    const { popoutWindow, container } = createPopout();
    render(h(NoteTypeSelect, { onChange: vi.fn() }), container);
    await act(() => openSelect(popoutWindow, container));
    expect(container.querySelector('.getnote-note-type-select-menu')).toBeTruthy();

    const plugin = new GetNoteSyncPlugin(new App());
    plugin.settings = { ...DEFAULT_SETTINGS };
    Object.defineProperty(HTMLElement.prototype, 'setText', {
      configurable: true,
      value(text: string) {
        this.textContent = text;
      },
    });
    vi.spyOn(Modal.prototype, 'open').mockImplementation(() => {});
    await act(() => {
      plugin.openManualSyncModal();
    });
    expect(container.querySelector('.getnote-note-type-select-menu')).toBeTruthy();

    Object.assign(globalThis, {
      activeDocument: popoutWindow.document,
      activeWindow: popoutWindow,
    });
    await act(() => {
      plugin.openManualSyncModal();
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBeNull();
    render(null, container);
    popoutWindow.close();
  });

  it('keeps one menu open after Obsidian migrates mounted selects into a popout', async () => {
    installWindowMigrationHook();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(() => {
      render(
        h('div', {}, [
          h(NoteTypeSelect, { onChange: vi.fn() }),
          h(NoteTypeSelect, { onChange: vi.fn() }),
        ]),
        container
      );
    });
    const popoutWindow = new Window({ url: 'https://getnote.test/migrated-popout' });
    migrateToPopout(popoutWindow, container);

    await act(() => openSelect(popoutWindow, container, 0));
    await act(() => openSelect(popoutWindow, container, 1));

    const triggers = container.querySelectorAll('.getnote-note-type-select-trigger');
    expect(container.querySelectorAll('.getnote-note-type-select-menu')).toHaveLength(1);
    expect(triggers[0].querySelector('.is-open')).toBeNull();
    expect(triggers[1].querySelector('.is-open')).toBeTruthy();

    render(null, container);
    popoutWindow.close();
  });

  it('closes a migrated popout menu before opening a command-driven modal', async () => {
    installWindowMigrationHook();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(() => {
      render(h(NoteTypeSelect, { onChange: vi.fn() }), container);
    });
    const popoutWindow = new Window({ url: 'https://getnote.test/migrated-command-popout' });
    migrateToPopout(popoutWindow, container);
    Object.assign(globalThis, {
      activeDocument: popoutWindow.document,
      activeWindow: popoutWindow,
    });

    await act(() => openSelect(popoutWindow, container));
    expect(container.querySelector('.getnote-note-type-select-menu')).toBeTruthy();

    const plugin = new GetNoteSyncPlugin(new App());
    plugin.settings = { ...DEFAULT_SETTINGS };
    Object.defineProperty(HTMLElement.prototype, 'setText', {
      configurable: true,
      value(text: string) {
        this.textContent = text;
      },
    });
    vi.spyOn(Modal.prototype, 'open').mockImplementation(() => {});
    await act(() => {
      plugin.openManualSyncModal();
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBeNull();
    render(null, container);
    popoutWindow.close();
  });

  it('repositions an open menu after its mounted tree migrates to a popout', async () => {
    installWindowMigrationHook();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(() => {
      render(h(NoteTypeSelect, { onChange: vi.fn() }), container);
    });
    const trigger = container.querySelector<HTMLButtonElement>('.getnote-note-type-select-trigger')!;
    let rect = { bottom: 20, left: 10, width: 120 };
    vi.spyOn(trigger, 'getBoundingClientRect').mockImplementation(
      () => ({ ...rect }) as DOMRect
    );
    await act(() => {
      trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const menu = container.querySelector<HTMLElement>('.getnote-note-type-select-menu')!;
    expect(menu.style.top).toBe('24px');

    const popoutWindow = new Window({ url: 'https://getnote.test/migrated-open-popout' });
    migrateToPopout(popoutWindow, container);
    rect = { bottom: 40, left: 30, width: 160 };
    await act(() => {
      popoutWindow.dispatchEvent(new popoutWindow.Event('resize'));
    });

    expect(menu.style.top).toBe('44px');
    expect(menu.style.left).toBe('30px');
    expect(menu.style.width).toBe('160px');
    render(null, container);
    popoutWindow.close();
  });

  it('closes an open menu from its new document after mounted-tree migration', async () => {
    installWindowMigrationHook();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(() => {
      render(h(NoteTypeSelect, { onChange: vi.fn() }), container);
    });
    await act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const popoutWindow = new Window({ url: 'https://getnote.test/migrated-open-outside' });
    migrateToPopout(popoutWindow, container);

    await act(() => {
      popoutWindow.document.body.dispatchEvent(new popoutWindow.MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBeNull();
    render(null, container);
    popoutWindow.close();
  });
});
