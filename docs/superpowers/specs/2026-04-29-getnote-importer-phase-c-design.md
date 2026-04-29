# Obsidian Get笔记 Importer — Phase C 设计规格

> 日期：2026-04-29
> 状态：草稿

---

## 1. 概述

**目标：** 在 Phase A + B 基础上，增加选择性同步（混合模式）和定时自动同步功能。

---

## 2. 选择性同步（混合模式）

### 2.1 交互路径

两种触发路径：

| 路径 | 触发方式 | 行为 |
|------|---------|------|
| **快速同步** | `▶ 立即同步` 按钮（默认） | 直接执行增量同步，不显示列表 |
| **选择性同步** | 设置面板新增按钮 | 弹窗显示笔记列表，用户勾选后同步 |

### 2.2 选择性同步弹窗（NotePickerModal）

**打开方式：** 设置面板新增 `📋 选择性同步` 按钮

**弹窗内容：**
```
┌── 选择要同步的笔记 ──────────────────┐
│ [全选] [全不选]
│ ──────────────────────────────────── │
│ [x] 标题 1          [纯文本]  10:30  │
│ [x] 标题 2          [链接笔记] 09:15  │
│ [ ] 标题 3          [录音长录] 昨天  │
│ ...                                  │
│ ──────────────────────────────────── │
│ 已选 2 条              [取消] [同步]  │
└──────────────────────────────────────┘
```

**字段说明：**
- 复选框：用户选择要同步的笔记
- 标题：无标题取 content 前 20 字符
- 类型标签：`纯文本` / `链接笔记` / `录音长录` 等
- 更新时间：显示 relative time（今天 HH:mm，昨天日期）

**加载逻辑：**
- 只拉最新 50 条（`limit=50`，不翻页）
- 加载中显示 spinner + "正在获取笔记列表..."
- 加载失败显示错误提示，可重试

**同步逻辑：**
- 点击 `同步` 后，只同步选中的 note_id 列表
- `sync.ts` 增加 `syncNoteIds(noteIds: string[])` 方法
- 同步完成后弹窗关闭，Notice 显示结果
- 点击 `取消` 或关闭按钮直接关闭弹窗

### 2.3 文件改动

- 新建 `src/ui/note-picker-modal.tsx` — 选择性同步弹窗（Obsidian Modal + React 内部）
- 修改 `src/settings/index.tsx` — 增加选择性同步按钮
- 修改 `src/sync.ts` — 增加 `syncNoteIds` 方法

---

## 3. 定时自动同步

### 3.1 新增设置项

| 字段 | 控件类型 | 默认值 | 说明 |
|------|---------|--------|------|
| 启用定时同步 | 开关 toggle | false | 是否开启后台定时同步 |
| 同步间隔（分钟） | 数字输入 | 30 | 最小值 5 |
| 启动时同步 | 开关 toggle | true | onload 时触发一次 |

### 3.2 实现

**定时器生命周期：**
```
onload()
  → if (settings.autoSyncEnabled) {
      if (settings.syncOnStart) startSync()    // 立即同步一次
      startAutoSync()                            // 启动定时器
    }

onunload()
  → stopAutoSync()    // 清除 setInterval
```

**同步冲突防护：**
- `isSyncing` 标志已在 Phase B 实现，定时触发时检查：
  ```typescript
  if (this.isSyncing) return;
  ```
- 定时同步静默跳过（不弹 Notice，不提示用户）

**后台同步的 Notice 策略：**
- 同步成功：不弹 Notice（静默，不打扰用户）
- 同步失败：弹 Warning Notice（`自动同步失败：{错误信息}`）
- 用户手动同步优先于定时同步（不会中断）

### 3.3 文件改动

- 修改 `src/types.ts` — 增加 `ScheduledSyncSettings` 类型
- 修改 `src/settings.ts` — 扩展 `Settings` 接口
- 修改 `src/settings/index.tsx` — 增加定时同步设置 UI
- 修改 `src/main.ts` — 增加 `startAutoSync()` / `stopAutoSync()`

---

## 4. Settings 扩展

### 4.1 扩展后的 Settings 接口

```typescript
interface ScheduledSyncSettings {
  enabled: boolean;          // 启用定时同步
  intervalMinutes: number;   // 间隔（分钟），最小 5
  syncOnStart: boolean;      // 启动时同步
}

interface Settings {
  apiToken: string;
  clientId: string;
  folderName: string;
  syncMode: 'incremental' | 'full';
  maxDays: number;
  scheduledSync: ScheduledSyncSettings;
}
```

---

## 5. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 定时同步进行中又触发定时 | `isSyncing` 检查，跳过 |
| 定时同步失败（网络/API） | Warning Notice，不打断其他操作 |
| 选择性同步加载列表失败 | 弹窗内显示错误 + 重试按钮 |
| 定时同步进行中用户手动触发 | 允许（不排队，但 `isSyncing` 保护） |

---

## 6. Phase C 不做的事

- 不做笔记搜索/过滤（选择性同步弹窗只有全选/全不选）
- 不做增量加载（选择性同步只拉 50 条，不翻页）
- 不做同步历史记录
- 不做定时同步结果的持久化（定时任务无状态重启）

---

## 7. 参考项目

- Omnivore 插件：定时同步（`setInterval` + `syncOnStart`）+ `syncing` 标志
- Obsidian Importer：`Modal` + 列表勾选 UI

---

## 8. 实现检查清单

- [ ] `types.ts` — 扩展 Settings 和 ScheduledSyncSettings
- [ ] `settings.ts` — 更新 DEFAULT_SETTINGS
- [ ] `settings/index.tsx` — 增加定时同步设置 UI + 选择性同步按钮
- [ ] `ui/note-picker-modal.tsx` — 选择性同步弹窗（Obsidian Modal 封装）
- [ ] `sync.ts` — 增加 `syncNoteIds(noteIds)` 方法
- [ ] `main.ts` — 增加 `startAutoSync()` / `stopAutoSync()`
- [ ] `settings-tab.tsx` — 透传新增的 props
- [ ] 构建验证
