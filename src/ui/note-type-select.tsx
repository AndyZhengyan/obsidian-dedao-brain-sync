import { useState } from 'preact/hooks';
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

interface NoteTypeSelectProps {
  value?: string[];
  onChange: (value: string[] | undefined) => void;
}

export function NoteTypeSelect({ value, onChange }: NoteTypeSelectProps) {
  const [open, setOpen] = useState(false);
  const allNoteTypes = NOTE_TYPE_OPTIONS.flatMap(option => option.noteTypes);
  const selectedTypes = value ?? allNoteTypes;
  const allSelected = value === undefined || selectedTypes.length === allNoteTypes.length;

  const handleTypeToggle = (noteTypes: string[], checked: boolean) => {
    const current = value ?? allNoteTypes;
    const next = checked
      ? Array.from(new Set([...current, ...noteTypes]))
      : current.filter(type => !noteTypes.includes(type));

    onChange(next.length === allNoteTypes.length ? undefined : next);
  };

  return (
    <div className="getnote-note-type-select">
      <button
        type="button"
        className="getnote-note-type-select-trigger"
        onClick={() => setOpen(value => !value)}
      >
        <span>{value === undefined ? t('noteTypes.all') : summarizeTypes(value)}</span>
        <span
          aria-hidden="true"
          className={`getnote-note-type-select-caret${open ? ' is-open' : ''}`}
        />
      </button>
      {open && (
        <div className="getnote-note-type-select-menu">
          <label className="getnote-note-type-select-option">
            <input
              type="checkbox"
              checked={allSelected}
              onChange={(event) => onChange((event.target as HTMLInputElement).checked ? undefined : [])}
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
        </div>
      )}
    </div>
  );
}
