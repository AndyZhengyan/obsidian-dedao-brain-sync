import type { ComponentChildren, JSX } from 'preact';

type ElectronWindow = Window & {
  require?: (moduleName: 'electron') => {
    shell?: {
      openExternal: (uri: string) => void;
    };
  };
};

export function openExternalUrl(uri: string): void {
  try {
    const electron = (window as ElectronWindow).require?.('electron');
    if (electron?.shell) {
      electron.shell.openExternal(uri);
      return;
    }
  } catch {
    // Fall back to window.open below.
  }
  window.open(uri, '_blank', 'noopener');
}

interface ExternalLinkProps {
  href: string;
  children: ComponentChildren;
}

export function ExternalLink({ href, children }: ExternalLinkProps): JSX.Element {
  const handleClick = (event: MouseEvent): void => {
    event.preventDefault();
    openExternalUrl(href);
  };

  return (
    <a href={href} target="_blank" rel="noopener" onClick={handleClick}>
      {children}
    </a>
  );
}
