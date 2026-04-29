# Obsidian Get笔记 Importer — Phase A 设计规格

> 日期：2026-04-29
> 状态：草稿

---

## 1. 概述

**目标：** 实现一个 Obsidian 社区插件，将 Get笔记 App 的笔记同步到 Obsidian 本地 vault，支持增量同步，不重复写入。

**范围：** Phase A（精简版），功能完整但不包含定时同步、选择性勾选、React 设置面板。

---

## 2. 技术栈

| 类别 | 选择 |
|------|------|
| 语言 | TypeScript |
| 构建工具 | esbuild |
| UI 框架 | 无 React，纯 Obsidian API |
| 依赖 | 零外部依赖（仅 Obsidian API + 原生 fetch） |

---

## 3. 文件结构

```
src/
  main.ts             # 插件入口，onload/onunload，注册命令/ribbon
  api.ts              # Get笔记 API 调用（list + 分页 + 错误处理）
  sync.ts             # 核心同步引擎
  settings-tab.ts     # PluginSettingTab，设置 UI
  settings.ts         # Settings 接口 + 默认值
  types.ts            # API 响应 + 内部类型定义
  note-parser.ts      # content → markdown 渲染 + frontmatter 生成
  ui/
    sync-modal.ts     # 同步进度弹窗（modal）
    loading-modal.ts  # 简单 loading 弹窗
    notice.ts         # 封装 new Notice
```

---

## 4. API 层（`api.ts`）

### 4.1 基础配置

- Base URL：`https://openapi.biji.com/open/api/v1`
- Headers（每请求必带）：
  - `Authorization: Bearer {token}`
  - `X-Client-ID: {clientId}`
- 请求工具：原生 `fetch`（Obsidian 18+ 内置）或 `requestUrl`（兼容移动端）

### 4.2 列表接口

```
GET /resource/note/list?since_id={cursor}&limit=50
```

**响应结构：**
```typescript
interface ListResponse {
  data: {
    notes: Note[];
    has_more: boolean;
    next_cursor: string;
  };
}

interface Note {
  id: number;          // 64位整数，JSON 解析前需预处理
  note_id: string;     // 字符串版本，用于文件名
  title: string;
  content: string;    // 正文（markdown），录音笔记为 AI 摘要
  note_type: string;  // plain_text | link | recorder_audio | ...
  source: string;     // web | app
  tags: Array<{ name: string }>;
  created_at: string;  // "2026-04-27T22:26:17+08:00"
  updated_at: string;
}
```

### 4.3 64位整数精度处理

Get笔记 API 返回的 `id` 字段是 64 位整数，直接 `JSON.parse` 会丢失精度。**必须在解析前做正则预处理：**

```typescript
function safeJsonParse(text: string): unknown {
  const safe = text.replace(/"(id|note_id|parent_id)"\s*:\s*(\d+)/g, '"$1":"$2"');
  return JSON.parse(safe);
}
```

> 来源：getnote-openclaw 项目 SKILL.md 关键发现

### 4.4 分页逻辑

- 使用 `since_id` 游标，初始传 `0`
- 每页 50 条（`limit=50`）
- 循环直到 `has_more === false`
- 429 错误：指数退避重试（1s → 2s → 4s），最多 3 次

---

## 5. 同步引擎（`sync.ts`）

### 5.1 核心流程

```
fetchNotes (分页循环)
  → 按 note_type 分类
  → 对每条笔记：
      生成文件名：{note_id}.md
      生成 frontmatter + 正文
      查询 vault 是否存在该文件
        存在 → 比较 updated_at：
          相同 → 跳过（skip++）
          不同 → 覆盖写入（update++）
        不存在 → 新建（create++）
```

### 5.2 目录结构

```
{vault_root}/
  {目标文件夹名}/           # 用户在设置中配置，默认 "Get笔记"
  ├── 纯文本/              # note_type: plain_text
  ├── 链接笔记/            # note_type: link
  ├── 即时录音/            # note_type: immediate_audio
  ├── 录音长录/            # note_type: recorder_audio | recorder_flash_audio | audio_long
  ├── 本地音频/            # note_type: local_audio
  └── 其他/               # 未分类类型
```

### 5.3 文件名

**格式：** `{note_id}.md`

**原因：** `note_id` 是字符串，不存在 64 位精度问题，直接用做文件名保证去重唯一性。

### 5.4 Frontmatter 格式

```yaml
---
uid: "{note_id}"
title: "{title}"
created: "{created_at_parsed}"   # 格式：YYYY-MM-DD HH:mm:ss
modified: "{updated_at_parsed}"
source: Get笔记
note_type: "{note_type}"
tags: ["标签1", "标签2"]
---
{content}
```

### 5.5 同步统计

```typescript
interface SyncResult {
  created: number;   // 新建
  updated: number;   // 覆盖更新
  skipped: number;   // 跳过（内容相同）
  failed: number;    // 失败
  total: number;     // 总计处理
}
```

---

## 6. 设置面板（`settings-tab.ts`）

### 6.1 设置项

| 字段 | 控件类型 | 默认值 | 说明 |
|------|---------|--------|------|
| API Token | 密码输入框 | 空 | Get笔记 API Token |
| Client ID | 文本输入框 | 空 | Get笔记 Client ID |
| 目标文件夹名 | 文本输入框 | `Get笔记` | vault 内子目录名 |
| 同步模式 | 下拉选择 | `增量同步` | `增量同步` / `全量同步` |
| 最大同步天数 | 数字输入框 | `30` | 只同步最近 N 天内的笔记 |

### 6.2 验证规则

- API Token 和 Client ID 为空时，同步按钮禁用，提示用户先填写
- 目标文件夹名不能包含 `/\:*?"<>|` 非法字符

---

## 7. 触发方式

| 方式 | 实现 |
|------|------|
| 命令面板 | `Get笔记: 同步笔记` |
| Ribbon 图标 | 左侧栏图标，点击触发 |
| 设置 Tab | 底部"立即同步"按钮 |

---

## 8. 进度与反馈

| 阶段 | UI 反馈 |
|------|---------|
| 同步开始 | `LoadingModal`（"正在获取笔记列表..."） |
| 分页获取中 | Modal 内更新（`已获取 N 条笔记`） |
| 同步完成 | `Notice` 提示（`同步完成：新增 X 条，更新 Y 条，跳过 Z 条`） |
| 部分失败 | `Notice` 红色警告，显示失败数量，不中断其他笔记 |
| 配置不完整 | 同步按钮禁用 + 提示文字 |

---

## 9. 错误处理

| 错误类型 | 处理方式 |
|---------|---------|
| 401 未授权 | Notice 提示"API Token 或 Client ID 无效"，终止同步 |
| 429 限流 | 退避重试（1s/2s/4s），超次后 Notice 提示"请求超限" |
| 500 服务错误 | 重试 1 次，仍失败则 Notice 提示并终止 |
| 网络错误 | Notice 提示"网络错误"，终止同步 |
| 文件写入失败 | Notice 提示该文件失败（显示 note_id），继续处理下一条 |

---

## 10. Phase A 不做的事

- 不做选择性勾选同步
- 不做定时自动同步
- 不做 React 设置面板
- 不做同步历史记录
- 不做附件（图片/音频）下载
- 不调 Detail API（返回 404）

---

## 11. 参考项目

- [obsidian-importer](https://github.com/obsidianmd/obsidian-importer) — ImporterPlugin 基类、FormatImporter 抽象、ImportContext 进度追踪
- [obsidian-omnivore](https://github.com/omnivore-app/obsidian-omnivore) — 增量同步模式（syncAt 时间戳）、frontmatter id 去重、Mustache 模板
- [obsidian-zotero-integration](https://github.com/obsidian-community/obsidian-zotero-integration) — React 设置面板模式、`vault.modify()` vs `vault.create()` 模式
- [getnote-openclaw](https://github.com/iswalle/getnote-openclaw) — 64位整数精度处理、分页策略、OAuth 流程参考

---

## 12. 实现检查清单

- [ ] `npm init` + 安装 obsidian api 类型
- [ ] `manifest.json`（插件清单）
- [ ] `main.ts` 插件入口骨架
- [ ] `types.ts` 类型定义
- [ ] `settings.ts` + `settings-tab.ts` 配置面板
- [ ] `api.ts` API 调用层（含精度处理）
- [ ] `note-parser.ts` markdown 生成
- [ ] `sync.ts` 同步引擎
- [ ] `ui/loading-modal.ts` + `ui/sync-modal.ts`
- [ ] `ui/notice.ts` 封装
- [ ] esbuild 配置文件
- [ ] README.md
