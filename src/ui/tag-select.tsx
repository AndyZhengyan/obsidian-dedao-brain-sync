import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';

interface TagSelectProps {
  /**
   * Current whitelist of tag names. Empty array means no filter (sync all).
   */
  value: string[];
  /**
   * List of tag names available for selection (from the local cache).
   */
  options: string[];
  onChange: (value: string[]) => void;
  placeholder?: string;
  /**
   * Whether the user can type a non-matching tag and add it on the fly.
   * Default: true. Disable in read-only filter contexts (e.g. the topic
   * picker, which should only filter by tags already present in the data).
   */
  allowCreate?: boolean;
  /**
   * Notify the parent when a brand-new tag is added via the search box so
   * the upstream cache can be merged (otherwise the new tag would be lost
   * on the next refresh). Optional — when omitted, the new tag is only
   * added to the local selection.
   */
  onCreateTag?: (tag: string) => void;
}

function summarize(value: string[]): string {
  if (value.length === 0) return t('noteTags.all');
  return t('noteTags.selected', { count: value.length });
}

function matchesFilter(tag: string, query: string): boolean {
  if (!query) return true;
  return tag.toLowerCase().includes(query.toLowerCase());
}

export function TagSelect({ value, onChange, options, placeholder, allowCreate = true, onCreateTag }: TagSelectProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<Record<string, string>>({});

  const selectedSet = new Set(value);
  const allSelected = value.length === 0;
  const visibleOptions = options.filter(tag => matchesFilter(tag, search));
  // The search box doubles as a creator: if the user types text that
  // doesn't match any existing option (case-insensitive), the typed value
  // is offered as a "create new tag" action. Pressing Enter on the input
  // (or clicking the row) commits it to the selection and the upstream
  // cache.
  const trimmedSearch = search.trim();
  const exactMatchExists = trimmedSearch.length > 0
    && options.some(tag => tag.toLowerCase() === trimmedSearch.toLowerCase());
  const showCreateRow = allowCreate && trimmedSearch.length > 0 && !exactMatchExists;

  const commitNewTag = (raw: string) => {
    const tag = raw.trim();
    if (!tag) return;
    if (value.some(t => t.toLowerCase() === tag.toLowerCase())) {
      setSearch('');
      return;
    }
    onCreateTag?.(tag);
    onChange(Array.from(new Set([...value, tag])));
    setSearch('');
  };

  const handleToggle = (tag: string, checked: boolean) => {
    if (checked) {
      onChange(Array.from(new Set([...value, tag])));
    } else {
      onChange(value.filter(t => t !== tag));
    }
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      onChange([]);
    } else {
      onChange([...options]);
    }
  };

  useEffect(() => {
    const close = () => setOpen(false);
    window.addEventListener('getnote-close-floating-selects', close);
    return () => window.removeEventListener('getnote-close-floating-selects', close);
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

  return (
    <div className="getnote-tag-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="getnote-tag-select-trigger"
        onClick={() => {
          if (!open) window.dispatchEvent(new Event('getnote-close-floating-selects'));
          setOpen(!open);
        }}
      >
        <span>{summarize(value)}</span>
        <span
          aria-hidden="true"
          className={`getnote-tag-select-caret${open ? ' is-open' : ''}`}
        />
      </button>
      {open && (
        <div className="getnote-tag-select-menu" data-tag-select-menu style={menuStyle}>
          <div className="getnote-tag-select-search">
            <input
              type="text"
              className="getnote-input"
              placeholder={placeholder ?? t('noteTags.searchPlaceholder')}
              value={search}
              onInput={(e) => setSearch((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && showCreateRow) {
                  e.preventDefault();
                  commitNewTag(trimmedSearch);
                }
              }}
            />
          </div>
          <div className="getnote-tag-select-options">
            <label className="getnote-tag-select-option">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={(e) => handleSelectAll((e.target as HTMLInputElement).checked)}
              />
              <span>{t('noteTags.all')}</span>
            </label>
            {visibleOptions.length === 0 && !showCreateRow && (
              <div className="getnote-tag-select-empty">{t('noteTags.noOptions')}</div>
            )}
            {showCreateRow && (
              <button
                type="button"
                className="getnote-tag-select-create"
                onClick={() => commitNewTag(trimmedSearch)}
              >
                {t('noteTags.create', { tag: trimmedSearch })}
              </button>
            )}
            {visibleOptions.map(tag => (
              <label className="getnote-tag-select-option" key={tag}>
                <input
                  type="checkbox"
                  checked={selectedSet.has(tag)}
                  onChange={(e) => handleToggle(tag, (e.target as HTMLInputElement).checked)}
                />
                <span>{tag}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
