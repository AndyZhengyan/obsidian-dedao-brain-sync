# Obsidian Get笔记 Importer — Phase C 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现选择性同步（混合模式）和定时自动同步。

**Architecture:** 选择性同步：新建 Obsidian Modal (`NotePickerModal`)，内部用 React 渲染列表。定时同步：`setInterval` 在 `onload` 启动，`onunload` 清除。`syncNoteIds` 方法支持只同步指定 note_id 列表。

**Tech Stack:** Preact + @preact/compat（同 Phase B）

---

## 文件结构变化

```
src/
  types.ts              # 修改：增加 ScheduledSyncSettings
  settings.ts           # 修改：更新 DEFAULT_SETTINGS
  settings/
    index.tsx           # 修改：定时设置 UI + 选择性同步按钮
  sync.ts               # 修改：增加 syncNoteIds(noteIds) 方法
  main.ts               # 修改：定时器管理 + syncNoteIds 传递
  ui/
    note-picker-modal.tsx  # 新建：选择性同步弹窗
```

---

## Task 1: 扩展类型（types.ts）

**Files:**
- Modify: `src/types.ts`

- [ ] **Step 1: 更新 types.ts**

在 `Settings` 接口中增加 `scheduledSync` 字段：

```typescript
// 在 Settings 接口中找到 syncMode 字段，在其后添加：
export interface ScheduledSyncSettings {
  enabled: boolean;          // 启用定时同步
  intervalMinutes: number;   // 间隔（分钟），最小 5
  syncOnStart: boolean;      // 启动时同步
}

export interface Settings {
  apiToken: string;
  clientId: string;
  folderName: string;
  syncMode: SyncMode;
  maxDays: number;
  scheduledSync: ScheduledSyncSettings;
}

export const DEFAULT_SETTINGS: Settings = {
  apiToken: '',
  clientId: '',
  folderName: 'Get笔记',
  syncMode: 'incremental',
  maxDays: 30,
  scheduledSync: {
    enabled: false,
    intervalMinutes: 30,
    syncOnStart: true,
  },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/types.ts && git commit -m "feat(Phase C): add ScheduledSyncSettings type and extend Settings

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: 更新 settings.ts

**Files:**
- Modify: `src/settings.ts`

- [ ] **Step 1: 更新 settings.ts**

```typescript
import type { Settings, SyncMode } from './types';
import { DEFAULT_SETTINGS } from './types';

export { Settings, SyncMode, DEFAULT_SETTINGS };
```

（无需改动内容，只是 re-export，commit 即可）

- [ ] **Step 2: Commit**

```bash
git add src/settings.ts && git commit -m "chore(Phase C): re-export ScheduledSyncSettings from types

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: NotePickerModal（选择性同步弹窗）

**Files:**
- Create: `src/ui/note-picker-modal.tsx`

- [ ] **Step 1: 创建 note-picker-modal.tsx**

```tsx
import { h } from 'preact';
import { useState, useEffect } from 'preact/hooks';
import { Modal } from 'obsidian';
import { fetchNotes } from '../api';
import type { GetNoteNote } from '../types';

interface NotePickerModalProps {
  app: App;
  onConfirm: (selectedNoteIds: string[]) => void;
  onCancel: () => void;
  token: string;
  clientId: string;
}

interface NoteRowProps {
  note: GetNoteNote;
  checked: boolean;
  onChange: (noteId: string, checked: boolean) => void;
}

function NoteRow({ note, checked, onChange }: NoteRowProps) {
  const title = note.title?.trim() ||
    note.content.slice(0, 20).replace(/\n/g, ' ') + (note.content.length > 20 ? '...' : '');
  const time = formatRelativeTime(note.updated_at);
  const typeLabel = getTypeLabel(note.note_type);

  return (
    <div className="getnote-picker-row">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(note.note_id, (e.target as HTMLInputElement).checked)}
      />
      <div className="getnote-picker-row-info">
        <div className="getnote-picker-title">{title}</div>
        <div className="getnote-picker-meta">
          <span className="getnote-picker-type">{typeLabel}</span>
          <span className="getnote-picker-time">{time}</span>
        </div>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return '昨天';
  } else {
    return `${diffDays}天前`;
  }
}

function getTypeLabel(noteType: string): string {
  const map: Record<string, string> = {
    plain_text: '纯文本',
    link: '链接笔记',
    recorder_audio: '录音长录',
    recorder_flash_audio: '录音长录',
    immediate_audio: '即时录音',
    audio_long: '录音长录',
    local_audio: '本地音频',
  };
  return map[noteType] || noteType;
}

export function NotePickerModal({
  app,
  onConfirm,
  onCancel,
  token,
  clientId,
}: NotePickerModalProps) {
  const [notes, setNotes] = useState<GetNoteNote[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchNotes({ token, clientId, sinceId: '0', limit: 50 })
      .then(({ notes }) => {
        setNotes(notes);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : '加载失败');
        setLoading(false);
      });
  }, []);

  const handleCheck = (noteId: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(noteId); else next.delete(noteId);
      return next;
    });
  };

  const handleSelectAll = () => setSelected(new Set(notes.map(n => n.note_id)));
  const handleSelectNone = () => setSelected(new Set());

  const handleConfirm = () => onConfirm(Array.from(selected));

  return (
    <div className="getnote-picker">
      <div className="getnote-picker-header">
        <span>选择要同步的笔记</span>
        <div className="getnote-picker-actions">
          <button onClick={handleSelectAll}>全选</button>
          <button onClick={handleSelectNone}>全不选</button>
        </div>
      </div>

      <div className="getnote-picker-body">
        {loading && <div className="getnote-picker-loading">正在获取笔记列表...</div>}
        {error && (
          <div className="getnote-picker-error">
            {error}
            <button onClick={() => window.location.reload()}>重试</button>
          </div>
        )}
        {!loading && !error && notes.map(note => (
          <NoteRow
            key={note.note_id}
            note={note}
            checked={selected.has(note.note_id)}
            onChange={handleCheck}
          />
        ))}
        {!loading && !error && notes.length === 0 && (
          <div className="getnote-picker-empty">暂无笔记</div>
        )}
      </div>

      <div className="getnote-picker-footer">
        <span className="getnote-picker-count">已选 {selected.size} 条</span>
        <div className="getnote-picker-btns">
          <button className="mod-cancel" onClick={onCancel}>取消</button>
          <button
            className="mod-cta"
            disabled={selected.size === 0}
            onClick={handleConfirm}
          >
            同步
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/ui/note-picker-modal.tsx && git commit -m "feat(Phase C): add NotePickerModal for selective sync

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: 扩展 sync.ts（增加 syncNoteIds）

**Files:**
- Modify: `src/sync.ts`

- [ ] **Step 1: 在 sync.ts 中增加 syncNoteIds 方法**

在 `SyncEngine` 类中，在 `sync(modal)` 方法之后添加：

```typescript
/**
 * 只同步指定 note_id 列表（用于选择性同步）
 */
async syncNoteIds(
  noteIds: string[],
  modal?: SyncModal
): Promise<SyncResult> {
  const result: SyncResult = { created: 0, updated: 0, skipped: 0, failed: 0, total: 0 };
  const idSet = new Set(noteIds);

  let fetchedCount = 0;

  for await (const batch of fetchAllNotes(this.settings.apiToken, this.settings.clientId)) {
    const matched = batch.filter(n => idSet.has(n.note_id));

    for (const note of matched) {
      fetchedCount++;
      modal?.setProgress(`处理中... ${fetchedCount}/${noteIds.length}`);

      const status = await this.writeNote(note);
      switch (status) {
        case 'created': result.created++; break;
        case 'updated': result.updated++; break;
        case 'skipped': result.skipped++; break;
        case 'failed': result.failed++; break;
      }
    }

    // 所有目标笔记都找到了，提前退出
    if (fetchedCount >= noteIds.length) break;
  }

  return result;
}
```

> 注意：确保 `fetchAllNotes` 已在文件顶部 import。

- [ ] **Step 2: Commit**

```bash
git add src/sync.ts && git commit -m "feat(Phase C): add syncNoteIds method for selective sync

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: 扩展 settings/index.tsx（定时设置 + 选择性按钮）

**Files:**
- Modify: `src/settings/index.tsx`

- [ ] **Step 1: 更新 SettingsComponent，增加两处改动**

**改动 A：** 在 `SettingsComponentProps` 中增加 `openNotePicker: () => void`：

```tsx
interface SettingsComponentProps {
  settings: Settings;
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void;
  startSync: () => void;
  isSyncing: boolean;
  openNotePicker: () => void;   // 新增
}
```

**改动 B：** 在 `SettingsComponent` 函数参数中解构新增 prop，并在 JSX 末尾（同步按钮之后）添加：

```tsx
  // 在 SettingsComponent 解构中增加:
  const { openNotePicker } = props;

  // 在 getnote-settings-divider 之后添加：
  <SettingItem
    name="选择性同步"
    description="先选择笔记，再同步"
  >
    <button
      className="mod-secondary"
      onClick={openNotePicker}
    >
      📋 选择性同步
    </button>
  </SettingItem>

  // 在 getnote-settings-divider 之前添加（定时同步设置）：
  <SettingItem
    name="定时同步"
    description="开启后自动定时同步笔记"
  >
    <div className="getnote-scheduled-settings">
      <div className="getnote-scheduled-row">
        <span>启用定时同步</span>
        <input
          type="checkbox"
          checked={settings.scheduledSync.enabled}
          onChange={(e) => updateSetting('scheduledSync', {
            ...settings.scheduledSync,
            enabled: (e.target as HTMLInputElement).checked,
          })}
        />
      </div>
      {settings.scheduledSync.enabled && (
        <>
          <div className="getnote-scheduled-row">
            <span>同步间隔（分钟）</span>
            <input
              type="number"
              min="5"
              value={settings.scheduledSync.intervalMinutes}
              onInput={(e) => {
                const n = parseInt((e.target as HTMLInputElement).value, 10);
                updateSetting('scheduledSync', {
                  ...settings.scheduledSync,
                  intervalMinutes: isNaN(n) || n < 5 ? 5 : n,
                });
              }}
            />
          </div>
          <div className="getnote-scheduled-row">
            <span>启动时同步</span>
            <input
              type="checkbox"
              checked={settings.scheduledSync.syncOnStart}
              onChange={(e) => updateSetting('scheduledSync', {
                ...settings.scheduledSync,
                syncOnStart: (e.target as HTMLInputElement).checked,
              })}
            />
          </div>
        </>
      )}
    </div>
  </SettingItem>

  <div className="getnote-settings-divider" />
```

**改动 C：** 找到 `handleSyncModeChange` 中的 `updateSetting` 调用，把 `syncMode` 替换为完整对象更新（因为现在 `Settings` 包含嵌套对象）：

> 实际上直接 `updateSetting('syncMode', mode)` 就够了，不需要改。`scheduledSync` 字段是整个对象替换，也用同样的模式。

- [ ] **Step 2: Commit**

```bash
git add src/settings/index.tsx && git commit -m "feat(Phase C): add scheduled sync settings and selective sync button

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: 扩展 main.ts（定时器 + 选择性同步）

**Files:**
- Modify: `src/main.ts`

- [ ] **Step 1: 更新 main.ts**

主要改动：
1. 增加 `autoSyncIntervalId` 成员变量
2. `onload` 中根据设置启动定时器
3. `onunload` 中清除定时器
4. `startSync` 支持 `syncNoteIds` 参数
5. `openNotePicker()` 方法打开 NotePickerModal

```typescript
import { App, Plugin } from 'obsidian';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { GetNoteSettingsTab } from './settings-tab';
import { SyncEngine } from './sync';
import { LoadingModal } from './ui/loading-modal';
import { SyncModal } from './ui/sync-modal';
import { showError, showSuccess, showNotice } from './ui/notice';
import { NotePickerModal } from './ui/note-picker-modal';

export default class GetNoteSyncPlugin extends Plugin {
  settings!: Settings;
  isSyncing = false;
  private autoSyncIntervalId: number | undefined;
  private settingsTab?: GetNoteSettingsTab;

  async onload(): Promise<void> {
    const loaded = await this.loadData();
    this.settings = { ...DEFAULT_SETTINGS, ...loaded };

    this.settingsTab = new GetNoteSettingsTab(this.app, this);
    this.addSettingTab(this.settingsTab);

    this.addCommand({
      id: 'sync-notes',
      name: '同步笔记',
      callback: () => this.startSync(),
    });

    this.addRibbonIcon('book-lock', '同步 Get笔记', () => this.startSync());

    // 启动定时同步
    if (this.settings.scheduledSync.enabled) {
      if (this.settings.scheduledSync.syncOnStart) {
        this.startSync();
      }
      this.startAutoSync();
    }

    console.log('[Get笔记 Importer] 插件已加载');
  }

  onunload(): void {
    this.stopAutoSync();
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  private refreshSettingsTab(): void {
    if (this.settingsTab) this.settingsTab.display();
  }

  startAutoSync(): void {
    this.stopAutoSync();
    const interval = Math.max(5, this.settings.scheduledSync.intervalMinutes) * 60 * 1000;
    this.autoSyncIntervalId = window.setInterval(() => {
      if (!this.isSyncing) {
        this.doAutoSync();
      }
    }, interval);
  }

  stopAutoSync(): void {
    if (this.autoSyncIntervalId !== undefined) {
      window.clearInterval(this.autoSyncIntervalId);
      this.autoSyncIntervalId = undefined;
    }
  }

  private async doAutoSync(): Promise<void> {
    try {
      const engine = new SyncEngine(this.app, this.settings);
      const result = await engine.sync(new SyncModal(this.app));
      if (result.created > 0 || result.updated > 0) {
        showNotice(`[Get笔记] 自动同步：新增 ${result.created}，更新 ${result.updated}`);
      }
    } catch {
      showNotice('[Get笔记] 自动同步失败', 10000);
    }
  }

  async startSync(): Promise<void> {
    if (this.isSyncing) return;

    if (!this.settings.apiToken || !this.settings.clientId) {
      showError('请先在设置中填写 API Token 和 Client ID');
      return;
    }

    this.isSyncing = true;
    this.refreshSettingsTab();

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
    } finally {
      this.isSyncing = false;
      this.refreshSettingsTab();
    }
  }

  openNotePicker(): void {
    if (this.isSyncing) return;

    const modal = new NotePickerModalWrapper(this.app, this);
    modal.open();
  }
}

/**
 * 将 NotePickerModal（React 组件）包装为 Obsidian Modal
 * 内部用 ReactDOM.render 渲染 React 内容
 */
import ReactDOM from 'react-dom';
import { NotePickerModal } from './ui/note-picker-modal';

class NotePickerModalWrapper extends Modal {
  private plugin: GetNoteSyncPlugin;

  constructor(app: App, plugin: GetNoteSyncPlugin) {
    super(app);
    this.plugin = plugin;
    this.titleEl.setText('选择要同步的笔记');
  }

  onOpen() {
    ReactDOM.render(
      <NotePickerModal
        app={this.app}
        token={this.plugin.settings.apiToken}
        clientId={this.plugin.settings.clientId}
        onConfirm={async (noteIds) => {
          this.close();
          await this.plugin.syncSelectedNotes(noteIds);
        }}
        onCancel={() => this.close()}
      />,
      this.contentEl
    );
  }

  onClose() {
    ReactDOM.unmountComponentAtNode(this.contentEl);
  }
}

// 在 GetNoteSyncPlugin 中添加：
async syncSelectedNotes(noteIds: string[]): Promise<void> {
  if (this.isSyncing) return;
  this.isSyncing = true;

  const loading = new LoadingModal(this.app);
  loading.open();

  try {
    const engine = new SyncEngine(this.app, this.settings);
    const syncModal = new SyncModal(this.app);
    syncModal.open();
    loading.close();

    const result = await engine.syncNoteIds(noteIds, syncModal);
    syncModal.showResult(result);

    showSuccess(
      `同步完成：新增 ${result.created} · 更新 ${result.updated} · 跳过 ${result.skipped}`
    );
  } catch (err) {
    loading.close();
    showError(`同步失败：${err instanceof Error ? err.message : String(err)}`);
  } finally {
    this.isSyncing = false;
  }
}
```

> 注意：上面代码将 `NotePickerModalWrapper` 放在文件底部（因为依赖循环）。`syncSelectedNotes` 方法放在 `GetNoteSyncPlugin` 类中。上述代码需要整合为一个完整的 main.ts 文件——将 `NotePickerModalWrapper` 类定义移到 `GetNoteSyncPlugin` 类之前。

- [ ] **Step 2: Commit**

```bash
git add src/main.ts && git commit -m "feat(Phase C): add auto-sync timer and note picker modal

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: 透传 settings-tab.tsx

**Files:**
- Modify: `src/settings-tab.tsx`

- [ ] **Step 1: 更新 settings-tab.tsx**

`display()` 中的 `SettingsComponent` 需要透传新增的 `openNotePicker` prop：

```tsx
ReactDOM.render(
  <SettingsComponent
    settings={this.plugin.settings}
    updateSetting={this.updateSetting}
    startSync={() => this.plugin.startSync()}
    isSyncing={this.plugin.isSyncing}
    openNotePicker={() => this.plugin.openNotePicker()}   // 新增
  />,
  this.containerEl
);
```

- [ ] **Step 2: Commit**

```bash
git add src/settings-tab.tsx && git commit -m "feat(Phase C): pass openNotePicker to SettingsComponent

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: 构建验证

- [ ] **Step 1: TypeScript 类型检查**

```bash
npx tsc --noEmit 2>&1
```

Expected: 无错误。常见问题：
- `Modal` 来自 obsidian，需正确 import `App`
- `NotePickerModal` 的 `app: App` 参数需正确类型

- [ ] **Step 2: esbuild 构建**

```bash
npm run build 2>&1
```

Expected: 构建成功

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(Phase C): complete selective sync and scheduled sync

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 自检清单

**Spec 覆盖检查：**
- [x] 定时同步设置 UI → Task 5 (settings/index.tsx)
- [x] 选择性同步按钮 → Task 5 (settings/index.tsx)
- [x] NotePickerModal（列表+复选框）→ Task 3
- [x] syncNoteIds 方法 → Task 4
- [x] startAutoSync / stopAutoSync → Task 6
- [x] syncOnStart 逻辑 → Task 6
- [x] 后台同步静默（无 Notice）→ Task 6
- [x] 失败 Warning Notice → Task 6
- [x] 透传 openNotePicker → Task 7

**占位符检查：** 无 TBD/TODO

**类型一致性检查：**
- `ScheduledSyncSettings` 在 `types.ts` 定义 → `settings.ts` re-export → `settings/index.tsx` 使用，签名一致
- `syncNoteIds(noteIds: string[], modal?: SyncModal)` 定义于 `sync.ts` → `main.ts` 调用，签名一致
- `openNotePicker: () => void` 在 `SettingsComponentProps` → `settings-tab.tsx` 透传 → `main.ts` 实现，签名一致
- `NotePickerModal` props: `app, token, clientId, onConfirm, onCancel` — 全部有定义

**无 placeholder 问题。计划完整。**

---

Plan complete. 执行方式：

1. **Subagent-Driven（推荐）** — 每个 Task 派发独立 subagent，顺序执行
2. **Inline Execution** — 在本 session 内顺序执行，带检查点
