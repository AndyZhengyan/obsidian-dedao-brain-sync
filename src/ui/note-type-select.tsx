import { useEffect, useRef, useState } from 'preact/hooks';
import { t } from '../i18n';
import { INTERNAL_AUDIO_NOTE_TYPES } from '../types';

// 顶层 UI 仅 5 个 group。订阅博主（blogger_post）从 UI 选项移除但仍默认同步。
// 9 种内部 audio 类型合并到"录音笔记"组；sync.ts 的 AUDIO_NOTE_TYPES 保持 9 种不变以解耦。
const NOTE_TYPE_OPTIONS = [
  { labelKey: 'picker.type.plain_text', noteTypes: ['plain_text'] },
  { labelKey: 'picker.type.img_text', noteTypes: ['img_text'] },
  { labelKey: 'picker.type.link', noteTypes: ['link'] },
  { labelKey: 'picker.type.audio_note', noteTypes: [...INTERNAL_AUDIO_NOTE_TYPES] },
  { labelKey: 'picker.type.unknown', noteTypes: ['blogger_post'] },
];

function getTypeLabel(labelKey: string): string {
  return t(labelKey);
}

function summarizeTypes(value: string[]): string {
  if (value.length === 0) return t('noteTypes.none');
  const matchingGroup = NOTE_TYPE_OPTIONS.find(option =>
    option.noteTypes.length === value.length &&
    option.noteTypes.every(noteType => value.includes(noteType))
  );
  if (matchingGroup) return getTypeLabel(matchingGroup.labelKey);
  return t('noteTypes.selected', { count: value.length });
}

function sameValue(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === undefined || b === undefined) return a === b;
  if (a.length !== b.length) return false;
  return a.every(item => b.includes(item));
}

interface NoteTypeSelectProps {
  value?: string[];
  onChange: (value: string[] | undefined) => void;
}

export function NoteTypeSelect({ value, onChange }: NoteTypeSelectProps) {
  const [open, setOpen] = useState(false);
  const [visibleValue, setVisibleValue] = useState<string[] | undefined>(value);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuStyle, setMenuStyle] = useState<Record<string, string>>({});
  const allNoteTypes = NOTE_TYPE_OPTIONS.flatMap(option => option.noteTypes);
  const selectedTypes = visibleValue ?? allNoteTypes;
  const allSelected = visibleValue === undefined || selectedTypes.length === allNoteTypes.length;
  const applying = !sameValue(visibleValue, value);

  useEffect(() => {
    setVisibleValue(value);
  }, [value]);

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

  const applyChange = (next: string[] | undefined) => {
    setVisibleValue(next);
    onChange(next);
  };

  const handleTypeToggle = (noteTypes: string[], checked: boolean) => {
    const current = visibleValue ?? allNoteTypes;
    const next = checked
      ? Array.from(new Set([...current, ...noteTypes]))
      : current.filter(type => !noteTypes.includes(type));

    applyChange(next.length === allNoteTypes.length ? undefined : next);
  };

  return (
    <div className="getnote-note-type-select" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className="getnote-note-type-select-trigger"
        onClick={() => {
          if (!open) window.dispatchEvent(new Event('getnote-close-floating-selects'));
          setOpen(!open);
        }}
      >
        <span>{visibleValue === undefined ? t('noteTypes.all') : summarizeTypes(visibleValue)}</span>
        <span
          aria-hidden="true"
          className={`getnote-note-type-select-caret${open ? ' is-open' : ''}`}
        />
      </button>
      {open && (
        <div className="getnote-note-type-select-menu" style={menuStyle}>
          <label className="getnote-note-type-select-option">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => applyChange((event.target as HTMLInputElement).checked ? undefined : [])}
            />
            <span>{t('noteTypes.all')}</span>
          </label>
          {NOTE_TYPE_OPTIONS.map(option => (
            <label className="getnote-note-type-select-option" key={option.labelKey}>
              <input
                type="checkbox"
                checked={option.noteTypes.every(noteType => selectedTypes.includes(noteType))}
                onChange={(event) => handleTypeToggle(option.noteTypes, (event.target as HTMLInputElement).checked)}
              />
              <span>{getTypeLabel(option.labelKey)}</span>
            </label>
          ))}
          {applying && (
            <div className="getnote-note-type-select-status">{t('noteTypes.applying')}</div>
          )}
        </div>
      )}
    </div>
  );
}
