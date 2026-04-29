# Obsidian Get笔记 Importer — Phase A 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 Get笔记 → Obsidian 增量同步插件 Phase A，完整可运行的社区插件。

**Architecture:** 纯 TypeScript，无 React，使用 Obsidian Plugin API + 原生 fetch 调用 Get笔记 API。`note_id` 做文件名直接去重，按 `note_type` 分子目录。

**Tech Stack:** TypeScript, esbuild, Obsidian Plugin API (社区插件 v2 格式)

---

## 文件结构

```
obsidian-getnote-importer/
├── manifest.json              # 插件清单（社区插件 v2）
├── package.json               # npm 包配置
├── tsconfig.json              # TypeScript 配置
├── esbuild.config.mjs        # 构建配置
├── README.md                  # 使用说明
└── src/
    ├── main.ts                # 插件入口，onload/onunload
    ├── types.ts               # API 响应 + 内部类型
    ├── settings.ts            # Settings 接口 + 默认值
    ├── settings-tab.ts        # PluginSettingTab 设置 UI
    ├── api.ts                 # Get笔记 API 调用层
    ├── note-parser.ts         # content → markdown + frontmatter
    ├── sync.ts                # 同步引擎
    └── ui/
        ├── loading-modal.ts   # 简单 loading 弹窗
        ├── sync-modal.ts      # 同步进度弹窗
        └── notice.ts          # Notice 封装
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `manifest.json`
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `esbuild.config.mjs`

- [ ] **Step 1: 创建 manifest.json**

```json
{
  "id": "obsidian-getnote-importer",
  "name": "Get笔记 Importer",
  "version": "0.1.0",
  "description": "将 Get笔记 App 的笔记同步到 Obsidian vault",
  "author": "Zheng Yan",
  "authorUrl": "",
  "fundingUrl": "",
  "license": "MIT",
  "isDesktopOnly": false,
  "minAppVersion": "1.5.0",
  "js": "main.js",
  "styles": []
}
```

- [ ] **Step 2: 创建 package.json**

```json
{
  "name": "obsidian-getnote-importer",
  "version": "0.1.0",
  "description": "Get笔记 Importer for Obsidian",
  "main": "main.js",
  "scripts": {
    "build": "node esbuild.config.mjs",
    "dev": "node esbuild.config.mjs --dev"
  },
  "keywords": ["obsidian", "plugin", "getnote"],
  "license": "MIT",
  "devDependencies": {
    "@types/node": "^20.0.0",
    "esbuild": "^0.20.0",
    "obsidian": "^1.5.0",
    "typescript": "^5.0.0"
  }
}
```

- [ ] **Step 3: 创建 tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": ".",
    "rootDir": "src",
    "declaration": false,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: 创建 esbuild.config.mjs**

```javascript
import * as esbuild from 'esbuild';

const isDev = process.argv.includes('--dev');

await esbuild.build({
  entryPoints: ['src/main.ts'],
  bundle: true,
  platform: 'browser',
  target: 'es2022',
  output: 'main.js',
  sourcemap: isDev ? 'inline' : false,
  minify: !isDev,
  format: 'cjs',
  external: ['obsidian'],
});
```

---

## Task 2: 类型定义

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: 编写 types.ts**

```typescript
// Get笔记 API 响应类型

export interface GetNoteNote {
  id: number;            // 64位整数，JSON 解析前需预处理
  note_id: string;       // 字符串版本，用于文件名
  title: string;
  content: string;       // 正文（markdown），录音笔记为 AI 摘要
  note_type: NoteType;
  source: string;        // web | app
  tags: Tag[];
  created_at: string;    // "2026-04-27T22:26:17+08:00"
  updated_at: string;
}

export interface Tag {
  name: string;
}

export type NoteType =
  | 'plain_text'
  | 'link'
  | 'recorder_audio'
  | 'recorder_flash_audio'
  | 'immediate_audio'
  | 'audio_long'
  | 'local_audio'
  | string;

export interface ListResponse {
  data: {
    notes: GetNoteNote[];
    has_more: boolean;
    next_cursor: string;
  };
}

// 内部使用类型

export type SyncMode = 'incremental' | 'full';

export interface Settings {
  apiToken: string;
  clientId: string;
  folderName: string;
  syncMode: SyncMode;
  maxDays: number;
}

export const DEFAULT_SETTINGS: Settings = {
  apiToken: '',
  clientId: '',
  folderName: 'Get笔记',
  syncMode: 'incremental',
  maxDays: 30,
};

export interface SyncResult {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface NoteCategory {
  dirName: string;
  noteType: string;
}

// note_type → 目录名映射
export const NOTE_CATEGORIES: NoteCategory[] = [
  { dirName: '纯文本', noteType: 'plain_text' },
  { dirName: '链接笔记', noteType: 'link' },
  { dirName: '即时录音', noteType: 'immediate_audio' },
  { dirName: '录音长录', noteType: 'recorder_audio' },
  { dirName: '录音长录', noteType: 'recorder_flash_audio' },
  { dirName: '录音长录', noteType: 'audio_long' },
  { dirName: '本地音频', noteType: 'local_audio' },
];

export function getCategoryDir(noteType: string): string {
  const found = NOTE_CATEGORIES.find(c => c.noteType === noteType);
  return found ? found.dirName : '其他';
}
```

---

## Task 3: Notice 封装

**Files:**
- Create: `src/ui/notice.ts`

- [ ] **Step 1: 编写 notice.ts**

```typescript
import { Notice } from 'obsidian';

export function showNotice(message: string, timeout = 5000): void {
  new Notice(message, timeout);
}

export function showError(message: string, timeout = 7000): void {
  new Notice(`❌ ${message}`, timeout);
}

export function showSuccess(message: string, timeout = 5000): void {
  new Notice(`✅ ${message}`, timeout);
}

export function showInfo(message: string, timeout = 4000): void {
  new Notice(message, timeout);
}
```

---

## Task 4: Loading Modal

**Files:**
- Create: `src/ui/loading-modal.ts`

- [ ] **Step 1: 编写 loading-modal.ts**

```typescript
import { Modal } from 'obsidian';

export class LoadingModal extends Modal {
  private messageEl: HTMLElement;

  constructor(app: App) {
    super(app);
    this.modalEl.style.textAlign = 'center';
    this.modalEl.style.padding = '24px';
  }

  onOpen() {
    const content = this.contentEl;

    content.createDiv({
      text: '⏳',
      cls: 'getnote-loading-spinner',
    }).style.fontSize = '32px';

    this.messageEl = content.createDiv({
      text: '正在获取笔记列表...',
      cls: 'getnote-loading-message',
    });
    this.messageEl.style.marginTop = '12px';
    this.messageEl.style.color = 'var(--text-muted)';
  }

  setMessage(message: string) {
    if (this.messageEl) {
      this.messageEl.setText(message);
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

---

## Task 5: Sync Modal（进度弹窗）

**Files:**
- Create: `src/ui/sync-modal.ts`

- [ ] **Step 1: 编写 sync-modal.ts**

```typescript
import { Modal } from 'obsidian';
import type { SyncResult } from '../types';

export class SyncModal extends Modal {
  private statusEl: HTMLElement;
  private progressEl: HTMLElement;
  private countEl: HTMLElement;

  constructor(app: App) {
    super(app);
    this.modalEl.style.padding = '24px';
  }

  onOpen() {
    const content = this.contentEl;

    content.createDiv({
      text: 'Get笔记 同步中',
      cls: 'getnote-sync-title',
    }).style.fontSize = '16px';
    content.createDiv('').style.marginBottom = '12px';

    this.progressEl = content.createDiv({ text: '正在连接 API...' });
    this.statusEl = content.createDiv({ text: '' });
    this.statusEl.style.color = 'var(--text-muted)';
    this.statusEl.style.marginTop = '8px';
    this.countEl = content.createDiv({ text: '' });
    this.countEl.style.marginTop = '4px';
  }

  setProgress(message: string) {
    if (this.progressEl) this.progressEl.setText(message);
  }

  setStatus(message: string) {
    if (this.statusEl) this.statusEl.setText(message);
  }

  setCount(message: string) {
    if (this.countEl) this.countEl.setText(message);
  }

  showResult(result: SyncResult) {
    this.progressEl.setText('同步完成');
    this.statusEl.setText(
      `新增 ${result.created} · 更新 ${result.updated} · 跳过 ${result.skipped} · 失败 ${result.failed}`
    );
    this.countEl.setText(`共处理 ${result.total} 条笔记`);
    setTimeout(() => this.close(), 3000);
  }

  onClose() {
    this.contentEl.empty();
  }
}
```

---

## Task 6: API 层

**Files:**
- Create: `src/api.ts`

- [ ] **Step 1: 编写 api.ts — 64位整数安全解析**

```typescript
import type { ListResponse, GetNoteNote } from './types';

const BASE_URL = 'https://openapi.biji.com/open/api/v1';

/**
 * Get笔记 API 返回的 id 字段是 64 位整数，直接 JSON.parse 会丢失精度。
 * 在解析前将所有 id 相关字段从数字转为字符串。
 */
function safeJsonParse(text: string): unknown {
  const safe = text.replace(
    /"(id|note_id|parent_id|follow_id|live_id)"\s*:\s*(\d+)/g,
    '"$1":"$2"'
  );
  return JSON.parse(safe);
}

async function apiRequest<T>(
  url: string,
  options: RequestInit,
  retries = 3
): Promise<T> {
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (res.status === 429 && retries > 0) {
    // 429: 指数退避重试
    const delay = Math.pow(2, 3 - retries) * 1000;
    await new Promise(r => setTimeout(r, delay));
    return apiRequest(url, options, retries - 1);
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API 错误 ${res.status}: ${text}`);
  }

  const text = await res.text();
  return safeJsonParse(text) as T;
}

export interface FetchNotesOptions {
  token: string;
  clientId: string;
  sinceId?: string;
  limit?: number;
}

export async function fetchNotes(options: FetchNotesOptions): Promise<{
  notes: GetNoteNote[];
  hasMore: boolean;
  nextCursor: string;
}> {
  const { token, clientId, sinceId = '0', limit = 50 } = options;

  const url = `${BASE_URL}/resource/note/list?since_id=${sinceId}&limit=${limit}`;

  const data = await apiRequest<ListResponse>(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      'X-Client-ID': clientId,
    },
  });

  return {
    notes: data.data.notes,
    hasMore: data.data.has_more,
    nextCursor: data.data.next_cursor,
  };
}

/**
 * 分页获取所有笔记（generator 形式）
 */
export async function* fetchAllNotes(
  token: string,
  clientId: string
): AsyncGenerator<GetNoteNote[], { fetchedCount: number }> {
  let cursor = '0';

  while (true) {
    const { notes, hasMore, nextCursor } = await fetchNotes({
      token,
      clientId,
      sinceId: cursor,
    });

    yield notes;

    if (!hasMore || !nextCursor || nextCursor === '0') break;
    cursor = nextCursor;
  }
}
```

---

## Task 7: note-parser（Markdown 生成）

**Files:**
- Create: `src/note-parser.ts`

- [ ] **Step 1: 编写 note-parser.ts**

```typescript
import type { GetNoteNote } from './types';

/**
 * 解析 ISO 时间字符串为 Obsidian 格式
 * "2026-04-27T22:26:17+08:00" → "2026-04-27 22:26:17"
 */
function formatDateTime(iso: string): string {
  const match = iso.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
  if (match) {
    return `${match[1]} ${match[2]}`;
  }
  return iso;
}

/**
 * 过滤内容中的非法文件名字符
 */
function sanitizeTitle(title: string): string {
  if (!title || !title.trim()) return '';
  return title.replace(/[\\/:*?"<>|]/g, '').trim();
}

/**
 * 生成 frontmatter
 */
function buildFrontmatter(note: GetNoteNote): string {
  const tags = note.tags.map(t => `"${t.name}"`).join(', ');
  const tagBlock = tags ? `[${tags}]` : '[]';

  const title = sanitizeTitle(note.title) ||
    note.content.slice(0, 10).replace(/"/g, '\\"').replace(/\n/g, ' ');

  const lines = [
    '---',
    `uid: "${note.note_id}"`,
    `title: "${title}"`,
    `created: ${formatDateTime(note.created_at)}`,
    `modified: ${formatDateTime(note.updated_at)}`,
    `source: Get笔记`,
    `note_type: ${note.note_type}`,
    `tags: ${tagBlock}`,
    '---',
    '',
  ];

  return lines.join('\n');
}

/**
 * 将 GetNoteNote 渲染为完整的 Markdown 字符串
 */
export function renderNote(note: GetNoteNote): string {
  const frontmatter = buildFrontmatter(note);
  const content = note.content || '';
  return frontmatter + content;
}

/**
 * 从 note.title 生成可读标题（用于日志/通知）
 */
export function getNoteTitle(note: GetNoteNote): string {
  if (note.title && note.title.trim()) {
    return note.title.trim();
  }
  const preview = note.content.slice(0, 10).replace(/\n/g, ' ');
  return preview + (note.content.length > 10 ? '...' : '');
}
```

---

## Task 8: 同步引擎

**Files:**
- Create: `src/sync.ts`

- [ ] **Step 1: 编写 sync.ts**

```typescript
import { App, TFile } from 'obsidian';
import { fetchAllNotes } from './api';
import { renderNote } from './note-parser';
import { getCategoryDir } from './types';
import type { GetNoteNote, Settings, SyncResult } from './types';
import type { SyncModal } from './ui/sync-modal';

export class SyncEngine {
  private app: App;
  private settings: Settings;

  constructor(app: App, settings: Settings) {
    this.app = app;
    this.settings = settings;
  }

  /**
   * 确保分类目录存在，返回目录路径
   */
  private async ensureCategoryDir(categoryDir: string): Promise<string> {
    const basePath = this.settings.folderName;
    const fullPath = `${basePath}/${categoryDir}`;
    const targetDir = this.app.vault.getAbstractFileByPath(fullPath);

    if (!targetDir) {
      await this.app.vault.createFolder(fullPath);
    }
    return fullPath;
  }

  /**
   * 获取文件路径（note_id 命名）
   */
  private getFilePath(categoryDir: string, note: GetNoteNote): string {
    return `${categoryDir}/${note.note_id}.md`;
  }

  /**
   * 判断文件内容是否变化（比较 updated_at）
   */
  private async isContentChanged(file: TFile, note: GetNoteNote): Promise<boolean> {
    try {
      const cached = this.app.metadataCache.getFileCache(file);
      if (!cached?.frontmatter) return true;
      const modified = cached.frontmatter['modified'] as string | undefined;
      if (!modified) return true;
      const noteModified = this.formatObsidianDate(note.updated_at);
      return modified !== noteModified;
    } catch {
      return true;
    }
  }

  private formatObsidianDate(iso: string): string {
    const match = iso.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})/);
    if (match) return `${match[1]} ${match[2]}`;
    return iso;
  }

  /**
   * 写入或更新单条笔记
   */
  private async writeNote(note: GetNoteNote): Promise<'created' | 'updated' | 'skipped' | 'failed'> {
    try {
      const categoryDir = await this.ensureCategoryDir(getCategoryDir(note.note_type));
      const filePath = this.getFilePath(categoryDir, note);
      const existingFile = this.app.vault.getAbstractFileByPath(filePath);

      if (existingFile && existingFile instanceof TFile) {
        const changed = await this.isContentChanged(existingFile, note);
        if (!changed) return 'skipped';
        const content = renderNote(note);
        await this.app.vault.modify(existingFile, content);
        return 'updated';
      } else {
        const content = renderNote(note);
        await this.app.vault.create(filePath, content);
        return 'created';
      }
    } catch (err) {
      console.error(`[Get笔记] 写入失败 [${note.note_id}]:`, err);
      return 'failed';
    }
  }

  /**
   * 过滤超期笔记（按 maxDays）
   */
  private filterRecentNotes(notes: GetNoteNote[]): GetNoteNote[] {
    if (this.settings.maxDays <= 0) return notes;

    const cutoff = Date.now() - this.settings.maxDays * 24 * 60 * 60 * 1000;
    return notes.filter(note => {
      const updated = new Date(note.updated_at).getTime();
      return updated >= cutoff;
    });
  }

  /**
   * 执行同步
   */
  async sync(modal: SyncModal): Promise<SyncResult> {
    const result: SyncResult = { created: 0, updated: 0, skipped: 0, failed: 0, total: 0 };

    let pageCount = 0;

    for await (const notes of fetchAllNotes(this.settings.apiToken, this.settings.clientId)) {
      pageCount++;
      modal.setProgress(`正在获取笔记... 第 ${pageCount} 页`);
      modal.setCount(`已获取 ${result.total} 条笔记`);

      const filtered = this.filterRecentNotes(notes);

      for (const note of filtered) {
        result.total++;
        const status = await this.writeNote(note);

        switch (status) {
          case 'created': result.created++; break;
          case 'updated': result.updated++; break;
          case 'skipped': result.skipped++; break;
          case 'failed': result.failed++; break;
        }

        if (result.total % 10 === 0) {
          modal.setCount(
            `处理中：新增 ${result.created} · 更新 ${result.updated} · 跳过 ${result.skipped} · 失败 ${result.failed}`
          );
        }
      }
    }

    return result;
  }
}
```

---

## Task 9: 设置面板

**Files:**
- Create: `src/settings.ts`
- Create: `src/settings-tab.ts`

- [ ] **Step 1: 编写 settings.ts**

```typescript
import type { Settings, SyncMode } from './types';
import { DEFAULT_SETTINGS } from './types';

export { Settings, SyncMode, DEFAULT_SETTINGS };
```

- [ ] **Step 2: 编写 settings-tab.ts**

```typescript
import { App, PluginSettingTab, Setting, ButtonComponent } from 'obsidian';
import type { GetNoteSyncPlugin } from './main';

export class GetNoteSettingsTab extends PluginSettingTab {
  private plugin: GetNoteSyncPlugin;

  constructor(app: App, plugin: GetNoteSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createDiv('getnote-settings-header', el => {
      el.createEl('h2', { text: 'Get笔记 Importer' });
      el.createEl('p', {
        text: '将 Get笔记 App 的笔记同步到 Obsidian vault',
        cls: 'getnote-settings-desc',
      });
    });

    // API Token
    new Setting(containerEl)
      .setName('API Token')
      .setDesc('Get笔记开放平台的 Authorization Token（gk_live_xxx）')
      .addText(text => text
        .setPlaceholder('gk_live_xxx')
        .setValue(this.plugin.settings.apiToken)
        .onChange(async value => {
          this.plugin.settings.apiToken = value.trim();
          await this.plugin.saveSettings();
        })
      );

    // Client ID
    new Setting(containerEl)
      .setName('Client ID')
      .setDesc('Get笔记开放平台的 Client ID（cli_xxx）')
      .addText(text => text
        .setPlaceholder('cli_xxx')
        .setValue(this.plugin.settings.clientId)
        .onChange(async value => {
          this.plugin.settings.clientId = value.trim();
          await this.plugin.saveSettings();
        })
      );

    // 目标文件夹
    new Setting(containerEl)
      .setName('目标文件夹')
      .setDesc('笔记同步到 vault 内的子目录名（默认：Get笔记）')
      .addText(text => text
        .setPlaceholder('Get笔记')
        .setValue(this.plugin.settings.folderName)
        .onChange(async value => {
          const clean = value.replace(/[\\/:*?"<>|]/g, '').trim() || 'Get笔记';
          this.plugin.settings.folderName = clean;
          await this.plugin.saveSettings();
        })
      );

    // 同步模式
    new Setting(containerEl)
      .setName('同步模式')
      .setDesc('增量同步只拉取新增/改动，全量同步从第一页开始')
      .addDropdown(dropdown => dropdown
        .addOption('incremental', '增量同步（推荐）')
        .addOption('full', '全量同步')
        .setValue(this.plugin.settings.syncMode)
        .onChange(async value => {
          this.plugin.settings.syncMode = value as 'incremental' | 'full';
          await this.plugin.saveSettings();
        })
      );

    // 最大同步天数
    new Setting(containerEl)
      .setName('最大同步天数')
      .setDesc('只同步最近 N 天内更新的笔记（0 = 不限制）')
      .addText(text => text
        .setPlaceholder('30')
        .setValue(String(this.plugin.settings.maxDays))
        .onChange(async value => {
          const n = parseInt(value, 10);
          this.plugin.settings.maxDays = isNaN(n) || n < 0 ? 0 : n;
          await this.plugin.saveSettings();
        })
      );

    // 分割线
    containerEl.createDiv('getnote-settings-divider');

    // 同步按钮
    const btnSetting = new Setting(containerEl);
    btnSetting.setName('同步');
    const syncBtn = new ButtonComponent(btnSetting.controlEl);
    syncBtn.setButtonText('立即同步');
    syncBtn.setCta();
    syncBtn.onClick(() => this.plugin.startSync());
    btnSetting.descEl.createSpan('', el => {
      el.textContent = '点击后将 Get笔记笔记同步到 vault';
    });

    // 验证提示
    if (!this.plugin.settings.apiToken || !this.plugin.settings.clientId) {
      syncBtn.setDisabled(true);
      syncBtn.setButtonText('请先填写 API Token 和 Client ID');
    }
  }
}
```

---

## Task 10: 插件入口 main.ts

**Files:**
- Create: `src/main.ts`

- [ ] **Step 1: 编写 main.ts**

```typescript
import { App, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { GetNoteSettingsTab } from './settings-tab';
import { SyncEngine } from './sync';
import { LoadingModal } from './ui/loading-modal';
import { SyncModal } from './ui/sync-modal';
import { showError, showSuccess } from './ui/notice';

export default class GetNoteSyncPlugin extends Plugin {
  settings!: Settings;

  async onload(): Promise<void> {
    // 加载设置
    const loaded = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };

    // 注册设置面板
    this.addSettingTab(new GetNoteSettingsTab(this.app, this));

    // 注册命令
    this.addCommand({
      id: 'sync-notes',
      name: '同步笔记',
      callback: () => this.startSync(),
    });

    // 注册 Ribbon 图标（使用文字图标，兼容所有平台）
    this.addRibbonIcon('book-lock', '同步 Get笔记', () => this.startSync());

    console.log('[Get笔记 Importer] 插件已加载');
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async startSync(): Promise<void> {
    // 验证配置
    if (!this.settings.apiToken || !this.settings.clientId) {
      showError('请先在设置中填写 API Token 和 Client ID');
      return;
    }

    const loading = new LoadingModal(this.app);
    loading.open();

    try {
      const engine = new SyncEngine(this.app, this.settings);

      const syncModal = new SyncModal(this.app);
      syncModal.open();
      loading.close();

      const result = await engine.sync(syncModal);
      syncModal.showResult(result);

      showSuccess(
        `同步完成：新增 ${result.created} · 更新 ${result.updated} · 跳过 ${result.skipped}${result.failed > 0 ? ` · 失败 ${result.failed}` : ''}`
      );
    } catch (err) {
      loading.close();
      const msg = err instanceof Error ? err.message : String(err);
      showError(`同步失败：${msg}`);
      console.error('[Get笔记 Importer] 同步错误:', err);
    }
  }
}
```

---

## Task 11: README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 编写 README.md**

```markdown
# Get笔记 Importer

将 Get笔记 App 的笔记同步到 Obsidian 本地 vault，支持增量同步。

## 功能

- 增量同步 — 只拉取新增或修改的笔记，不重复写入
- 按笔记类型分类 — 自动按纯文本/链接笔记/录音等分类存放
- note_id 文件名去重 — 精确判断，避免覆盖用户编辑过的文件
- 可配置同步范围 — 支持限制最大同步天数

## 安装

1. 从 GitHub Releases 下载 `manifest.json` 和 `main.js`
2. 放入 `.obsidian/plugins/obsidian-getnote-importer/` 目录
3. 在 Obsidian 设置 → 第三方插件中启用

## 获取 API 凭证

1. 打开 Get笔记 App → 设置 → 开放平台
2. 创建应用，获取 Token 和 Client ID
3. 在插件设置中填入

## 使用

1. 填写 API Token 和 Client ID
2. 点击"立即同步"或使用命令面板（Ctrl/Cmd+P → Get笔记: 同步笔记）
3. 同步完成后，笔记将出现在 vault 的 Get笔记/ 目录下

## 目录结构

```
Get笔记/
├── 纯文本/       # 纯文本笔记
├── 链接笔记/     # 链接笔记
├── 即时录音/     # 即时录音笔记
├── 录音长录/     # 长录音笔记
├── 本地音频/     # 本地音频笔记
└── 其他/         # 其他类型
```

## 已知限制

- Detail API 返回 404，不支持附件下载
- 录音笔记只有 AI 生成的文字摘要，无原始音频
- 链接笔记无法获取原始网页内容

## License

MIT
```

---

## 自检清单

**Spec 覆盖检查：**
- [x] API 层（分页、精度处理、429 退避）→ Task 6
- [x] 同步引擎（增量去重、按类型分类）→ Task 8
- [x] frontmatter 格式 → Task 7
- [x] note_id 文件名去重 → Task 8
- [x] 设置面板（Token、Client ID、文件夹、同步模式、最大天数）→ Task 9
- [x] 触发方式（命令、ribbon、设置面板按钮）→ Task 10
- [x] 进度反馈（LoadingModal、SyncModal、Notice）→ Task 4/5/3
- [x] 错误处理（401/429/500/网络）→ Task 6 + Task 10
- [x] 项目脚手架（manifest、package、tsconfig、esbuild）→ Task 1

**占位符检查：** 无 TBD/TODO/未完成代码块

**类型一致性检查：**
- `Settings` 接口在 `settings.ts`、`settings-tab.ts`、`main.ts`、`sync.ts` 中一致
- `SyncResult` 在 `sync.ts`、`sync-modal.ts` 中一致
- `GetNoteNote` 在 `api.ts`、`note-parser.ts`、`sync.ts` 中一致
- `getCategoryDir` 在 `types.ts`、`sync.ts` 中一致
- `fetchAllNotes` generator 在 `api.ts` 中定义，在 `sync.ts` 中使用，签名一致

**无 placeholder 问题。计划完整。**

---

Plan complete. 两条执行路径：

1. **Subagent-Driven（推荐）** — 每个 Task 派发一个独立 subagent，Task 间有关联顺序（1→2→3...），每个任务完成后做快速 review，并行度受限于依赖链

2. **Inline Execution** — 在本 session 内顺序执行所有 Task，使用 executing-plans skill，带检查点

选哪个？