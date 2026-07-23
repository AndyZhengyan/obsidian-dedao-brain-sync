import { afterEach, describe, expect, it, vi } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';
import { NoteTypeSelect } from '../src/ui/note-type-select';

afterEach(() => {
  vi.restoreAllMocks();
  render(null, document.body);
  document.body.innerHTML = '';
});

describe('floating select menu behavior', () => {
  it('keeps the existing global close coordination between floating selects', async () => {
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

  it('closes an open floating select on outside mouse down', async () => {
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

  it('closes an open floating select on outside mouse down in its owning document', async () => {
    const popoutDocument = document.implementation.createHTMLDocument('popout');
    const container = popoutDocument.createElement('div');
    popoutDocument.body.appendChild(container);
    render(h(NoteTypeSelect, { onChange: vi.fn() }), container);

    await act(() => {
      container.querySelector('button')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(container.querySelector('.getnote-note-type-select-menu')).toBeTruthy();

    await act(() => {
      popoutDocument.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    });

    expect(container.querySelector('.getnote-note-type-select-menu')).toBeNull();
    render(null, container);
  });
});
