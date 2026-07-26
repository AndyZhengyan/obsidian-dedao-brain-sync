import { useEffect, useRef, useState } from 'preact/hooks';

const CLOSE_FLOATING_SELECTS_EVENT = 'getnote-close-floating-selects';

function resolveHostRealm(root: HTMLDivElement | null): {
  hostDocument: Document;
  hostWindow: Window;
} {
  const fallbackDocument = typeof activeDocument === 'undefined' ? document : activeDocument;
  const hostDocument = root?.ownerDocument ?? fallbackDocument;
  const fallbackWindow = typeof activeWindow === 'undefined' ? window : activeWindow;
  const hostWindow = hostDocument.defaultView ?? fallbackDocument.defaultView ?? fallbackWindow;
  return { hostDocument, hostWindow };
}

export function useFloatingSelectMenu<TTrigger extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<TTrigger>(null);
  const [menuStyle, setMenuStyle] = useState<Record<string, string>>({});

  useEffect(() => {
    const close = () => setOpen(false);
    const { hostWindow } = resolveHostRealm(rootRef.current);
    hostWindow.addEventListener(CLOSE_FLOATING_SELECTS_EVENT, close);
    return () => hostWindow.removeEventListener(CLOSE_FLOATING_SELECTS_EVENT, close);
  }, []);

  useEffect(() => {
    if (!open) return;
    const positionMenu = () => {
      const rect = triggerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setMenuStyle({
        top: `${rect.bottom + 4}px`,
        left: `${rect.left}px`,
        width: `${rect.width}px`,
      });
    };
    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
    };
    const { hostDocument, hostWindow } = resolveHostRealm(rootRef.current);
    positionMenu();
    hostDocument.addEventListener('mousedown', handlePointerDown);
    hostWindow.addEventListener('resize', positionMenu);
    hostWindow.addEventListener('scroll', positionMenu, true);
    return () => {
      hostDocument.removeEventListener('mousedown', handlePointerDown);
      hostWindow.removeEventListener('resize', positionMenu);
      hostWindow.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open) {
      const { hostDocument, hostWindow } = resolveHostRealm(rootRef.current);
      const closeEvent = hostDocument.createEvent('Event');
      closeEvent.initEvent(CLOSE_FLOATING_SELECTS_EVENT, false, false);
      hostWindow.dispatchEvent(closeEvent);
    }
    setOpen(!open);
  };

  return {
    open,
    setOpen,
    rootRef,
    triggerRef,
    menuStyle,
    toggleOpen,
  };
}
