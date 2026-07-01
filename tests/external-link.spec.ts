import { afterEach, describe, expect, it, vi } from 'vitest';
import { openExternalUrl } from '../src/settings/external-link';

type ElectronWindow = Window & {
  require?: (moduleName: 'electron') => {
    shell?: {
      openExternal: (uri: string) => void;
    };
  };
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (window as ElectronWindow).require;
});

describe('openExternalUrl', () => {
  it('uses the Electron shell when available', () => {
    const openExternal = vi.fn();
    (window as ElectronWindow).require = vi.fn(() => ({ shell: { openExternal } }));
    const windowOpen = vi.spyOn(window, 'open');

    openExternalUrl('https://example.com/docs');

    expect(openExternal).toHaveBeenCalledWith('https://example.com/docs');
    expect(windowOpen).not.toHaveBeenCalled();
  });

  it('falls back to window.open with noopener when Electron is unavailable', () => {
    const windowOpen = vi.spyOn(window, 'open').mockReturnValue(null);

    openExternalUrl('https://example.com/docs');

    expect(windowOpen).toHaveBeenCalledWith('https://example.com/docs', '_blank', 'noopener');
  });
});
