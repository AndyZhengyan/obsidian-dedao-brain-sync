import { INTERNAL_AUDIO_NOTE_TYPES } from '../types';
import { t } from '../i18n';

/**
 * 把 GetNote 的内部 note_type 字符串折叠成 UI 上展示的 5 种"组标签"。
 *
 * - 9 种内部 audio 类型（recorder_audio / meeting / …）→ '录音笔记'
 * - blogger_post（订阅博主，UI 已隐藏） → '其他'
 * - 其他原始 key 缺失或未识别时回退到 '其他'
 *
 * note-picker modal 与 sync-history modal 共用此逻辑，确保笔记类型标签一致。
 */
export function formatNoteTypeLabel(noteType: string): string {
  if (INTERNAL_AUDIO_NOTE_TYPES.includes(noteType)) {
    return t('picker.type.audio_note');
  }
  if (noteType === 'blogger_post') {
    return t('picker.type.unknown');
  }
  const key = `picker.type.${noteType}`;
  const label = t(key);
  // t() 在 key 缺失时原样返回 key；若仍是 key 形式则视为未识别
  return label === key ? t('picker.type.unknown') : label;
}
