import { t } from '../i18n';

export function formatPickerRelativeTime(iso: string): string {
  if (!iso) return '';

  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  }

  if (diffDays === 1) {
    return t('picker.yesterday');
  }

  return `${diffDays}${t('picker.daysAgo')}`;
}
