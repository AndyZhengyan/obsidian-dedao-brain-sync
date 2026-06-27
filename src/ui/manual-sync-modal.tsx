import { useState } from 'preact/hooks';
import type { SyncScopeOptions } from '../types';
import { t } from '../i18n';
import { NoteTypeSelect } from './note-type-select';
import { TagSelect } from './tag-select';

type SyncMode = 'date' | 'days';

interface ManualSyncModalProps {
  initialOptions: SyncScopeOptions;
  tagOptions?: string[];
  onConfirm: (options: SyncScopeOptions) => void;
  onCancel: () => void;
}

function resolveInitialSyncMode(initialOptions: SyncScopeOptions): SyncMode {
  const hasDate = Boolean(initialOptions.syncStartDate);
  const hasDays = initialOptions.maxDays > 0;
  if (!hasDate && !hasDays) return 'days';
  if (hasDate && !hasDays) return 'date';
  if (!hasDate && hasDays) return 'days';

  const startTime = Date.parse(initialOptions.syncStartDate);
  if (Number.isNaN(startTime)) return 'days';

  const daysCutoff = Date.now() - initialOptions.maxDays * 24 * 60 * 60 * 1000;
  return daysCutoff >= startTime ? 'days' : 'date';
}

function getLocalDateInputValue(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function ManualSyncModal({ initialOptions, tagOptions = [], onConfirm, onCancel }: ManualSyncModalProps) {
  const [syncMode, setSyncMode] = useState<SyncMode>(resolveInitialSyncMode(initialOptions));
  const [syncStartDate, setSyncStartDate] = useState(initialOptions.syncStartDate || getLocalDateInputValue());
  const [maxDays, setMaxDays] = useState(String(initialOptions.maxDays));
  const [enabledNoteTypes, setEnabledNoteTypes] = useState<string[] | undefined>(initialOptions.enabledNoteTypes);
  const [syncTags, setSyncTags] = useState<string[]>(initialOptions.syncTags ?? []);

  const handleConfirm = () => {
    if (syncMode === 'date') {
      onConfirm({
        syncStartDate,
        maxDays: 0,
        ...(enabledNoteTypes !== undefined ? { enabledNoteTypes } : {}),
        ...(syncTags.length > 0 ? { syncTags } : {}),
      });
    } else {
      const parsedMaxDays = parseInt(maxDays, 10);
      onConfirm({
        syncStartDate: '',
        maxDays: Number.isNaN(parsedMaxDays) || parsedMaxDays < 1 ? 1 : parsedMaxDays,
        ...(enabledNoteTypes !== undefined ? { enabledNoteTypes } : {}),
        ...(syncTags.length > 0 ? { syncTags } : {}),
      });
    }
  };

  return (
    <div className="getnote-manual-sync-modal">
      <div className="getnote-manual-sync-body">
        <div className="getnote-manual-sync-card">
          <div className="getnote-sync-mode-selector" role="group" aria-label={t('manualSync.title')}>
            <label className="getnote-sync-mode-option">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === 'date'}
                onChange={() => setSyncMode('date')}
              />
              <span>{t('manualSync.mode.date')}</span>
            </label>
            <label className="getnote-sync-mode-option">
              <input
                type="radio"
                name="syncMode"
                checked={syncMode === 'days'}
                onChange={() => setSyncMode('days')}
              />
              <span>{t('manualSync.mode.days')}</span>
            </label>
          </div>

          <div className="getnote-manual-sync-fields">
            {syncMode === 'date' ? (
              <label className="getnote-manual-sync-field">
                <span>{t('manualSync.startDate')}</span>
                <input
                  type="date"
                  className="getnote-input getnote-date-input"
                  value={syncStartDate}
                  onChange={(e) => setSyncStartDate((e.target as HTMLInputElement).value)}
                />
              </label>
            ) : (
              <label className="getnote-manual-sync-field">
                <span>{t('manualSync.maxDays')}</span>
                <input
                  type="number"
                  min="1"
                  className="getnote-input getnote-date-input"
                  value={maxDays}
                  onInput={(e) => setMaxDays((e.target as HTMLInputElement).value)}
                />
              </label>
            )}
            <label className="getnote-manual-sync-field">
              <span>{t('settings.noteTypes.label')}</span>
              <NoteTypeSelect value={enabledNoteTypes} onChange={setEnabledNoteTypes} />
            </label>
            <label className="getnote-manual-sync-field">
              <span>{t('settings.syncTags.label')}</span>
              <TagSelect
                value={syncTags}
                options={tagOptions}
                onChange={setSyncTags}
              />
            </label>
          </div>
        </div>
        <div className="getnote-input-hint">{t('manualSync.hint')}</div>
      </div>
      <div className="getnote-picker-footer">
        <span className="getnote-picker-count">{t('manualSync.once')}</span>
        <div className="getnote-picker-btns">
          <button className="mod-cancel" onClick={onCancel}>{t('picker.cancel')}</button>
          <button className="mod-cta" onClick={handleConfirm}>{t('picker.confirm')}</button>
        </div>
      </div>
    </div>
  );
}
