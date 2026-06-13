import { describe, it, expect } from 'vitest';
import { getCategoryDir, DEFAULT_SETTINGS, NOTE_CATEGORIES, getAuthCredentials, migrateEnabledNoteTypes } from '../src/types';

describe('getCategoryDir', () => {
  it('plain_text → 纯文本', () => {
    expect(getCategoryDir('plain_text')).toBe('纯文本');
  });

  it('link → 链接笔记', () => {
    expect(getCategoryDir('link')).toBe('链接笔记');
  });

  it('img_text → 图片笔记', () => {
    expect(getCategoryDir('img_text')).toBe('图片笔记');
  });

  it('immediate_audio → 录音笔记 (内部 audio 类型统一)', () => {
    expect(getCategoryDir('immediate_audio')).toBe('录音笔记');
  });

  it('recorder_audio → 录音笔记', () => {
    expect(getCategoryDir('recorder_audio')).toBe('录音笔记');
  });

  it('recorder_flash_audio → 录音笔记', () => {
    expect(getCategoryDir('recorder_flash_audio')).toBe('录音笔记');
  });

  it('audio_long → 录音笔记', () => {
    expect(getCategoryDir('audio_long')).toBe('录音笔记');
  });

  it('local_audio → 录音笔记', () => {
    expect(getCategoryDir('local_audio')).toBe('录音笔记');
  });

  it('audio / class_audio / internal_record / meeting → 录音笔记', () => {
    expect(getCategoryDir('audio')).toBe('录音笔记');
    expect(getCategoryDir('class_audio')).toBe('录音笔记');
    expect(getCategoryDir('internal_record')).toBe('录音笔记');
    expect(getCategoryDir('meeting')).toBe('录音笔记');
  });

  it('blogger_post → 订阅博主 (子目录)', () => {
    expect(getCategoryDir('blogger_post')).toBe('其他/订阅博主');
  });

  it('未知类型 → 其他', () => {
    expect(getCategoryDir('unknown_type')).toBe('其他');
  });

  it('空字符串 → 其他', () => {
    expect(getCategoryDir('')).toBe('其他');
  });
});

describe('DEFAULT_SETTINGS', () => {
  it('folderName 默认为 得到大脑', () => {
    expect(DEFAULT_SETTINGS.folderName).toBe('得到大脑');
  });

  it('maxDays 默认为 30', () => {
    expect(DEFAULT_SETTINGS.maxDays).toBe(30);
  });

  it('scheduledSync 默认关闭', () => {
    expect(DEFAULT_SETTINGS.scheduledSync.enabled).toBe(false);
  });

  it('syncHistory 默认空数组', () => {
    expect(DEFAULT_SETTINGS.syncHistory).toEqual([]);
  });

  it('scheduledSync.enabledNoteTypes 默认不设置表示定时同步全部类型', () => {
    expect(DEFAULT_SETTINGS.scheduledSync.enabledNoteTypes).toBeUndefined();
  });

  it('scheduledSync 默认间隔 30 分钟', () => {
    expect(DEFAULT_SETTINGS.scheduledSync.intervalMinutes).toBe(30);
  });

  it('apiToken 和 clientId 默认空', () => {
    expect(DEFAULT_SETTINGS.authMode).toBe('openapi');
    expect(DEFAULT_SETTINGS.apiToken).toBe('');
    expect(DEFAULT_SETTINGS.clientId).toBe('');
    expect(DEFAULT_SETTINGS.openApiToken).toBe('');
    expect(DEFAULT_SETTINGS.openApiClientId).toBe('');
    expect(DEFAULT_SETTINGS.webApiToken).toBe('');
    expect(DEFAULT_SETTINGS.webCsrfToken).toBe('');
  });
});

describe('getAuthCredentials', () => {
  it('OpenAPI 模式使用 OpenAPI 专用凭证', () => {
    const credentials = getAuthCredentials({
      ...DEFAULT_SETTINGS,
      authMode: 'openapi',
      apiToken: 'legacy-active-token',
      clientId: 'legacy-client',
      openApiToken: 'openapi-token',
      openApiClientId: 'openapi-client',
      webApiToken: 'web-token',
    });

    expect(credentials).toEqual({
      token: 'openapi-token',
      clientId: 'openapi-client',
      authMode: 'openapi',
    });
  });

  it('Web 模式使用 Web 专用 token 且不需要 clientId', () => {
    const credentials = getAuthCredentials({
      ...DEFAULT_SETTINGS,
      authMode: 'web',
      apiToken: 'legacy-active-token',
      clientId: 'legacy-client',
      openApiToken: 'openapi-token',
      openApiClientId: 'openapi-client',
      webApiToken: 'web-token',
    });

    expect(credentials).toEqual({
      token: 'web-token',
      clientId: '',
      authMode: 'web',
    });
  });
});

describe('NOTE_CATEGORIES', () => {
  it('每个分类目录名都不为空', () => {
    for (const cat of NOTE_CATEGORIES) {
      expect(cat.dirName).toBeTruthy();
    }
  });

  it('不包含重复映射', () => {
    const seen = new Set<string>();
    for (const cat of NOTE_CATEGORIES) {
      const key = `${cat.noteType}->${cat.dirName}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it('顶层目录仅 5 个 (纯文本/图片笔记/链接笔记/录音笔记/其他)', () => {
    const topDirs = new Set(NOTE_CATEGORIES.map(c => c.dirName.split('/')[0]));
    expect(topDirs).toEqual(new Set(['纯文本', '图片笔记', '链接笔记', '录音笔记', '其他']));
  });
});

describe('migrateEnabledNoteTypes', () => {
  it('undefined 输入保持 undefined (表示"全部类型")', () => {
    expect(migrateEnabledNoteTypes(undefined)).toBeUndefined();
  });

  it('保留所有规范内部类型，丢弃未知值', () => {
    const result = migrateEnabledNoteTypes(['plain_text', 'unknown_x', 'link', 'blogger_post']);
    expect(result).toEqual(expect.arrayContaining(['plain_text', 'link', 'blogger_post']));
    expect(result).not.toContain('unknown_x');
  });

  it('老用户勾过的 9 种 audio 类型仍然保留', () => {
    const oldAudio = [
      'recorder_audio',
      'recorder_flash_audio',
      'immediate_audio',
      'audio_long',
      'local_audio',
      'audio',
      'class_audio',
      'internal_record',
      'meeting',
    ];
    const result = migrateEnabledNoteTypes(oldAudio);
    for (const t of oldAudio) {
      expect(result).toContain(t);
    }
  });

  it('空数组保持空数组 (表示"未选择任何类型")', () => {
    expect(migrateEnabledNoteTypes([])).toEqual([]);
  });
});
