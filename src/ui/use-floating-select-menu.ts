import { useEffect, useRef, useState } from 'preact/hooks';

const CLOSE_FLOATING_SELECTS_EVENT = 'getnote-close-floating-selects';

export function useFloatingSelectMenu<TTrigger extends HTMLElement>() {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<TTrigger>(null);
  const [menuStyle, setMenuStyle] = useState<Record<string, string>>({});

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener(CLOSE_FLOATING_SELECTS_EVENT, close);
    return () => window.removeEventListener(CLOSE_FLOATING_SELECTS_EVENT, close);
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
    positionMenu();
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('resize', positionMenu);
    window.addEventListener('scroll', positionMenu, true);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('resize', positionMenu);
      window.removeEventListener('scroll', positionMenu, true);
    };
  }, [open]);

  const toggleOpen = () => {
    if (!open) window.dispatchEvent(new Event(CLOSE_FLOATING_SELECTS_EVENT));
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
