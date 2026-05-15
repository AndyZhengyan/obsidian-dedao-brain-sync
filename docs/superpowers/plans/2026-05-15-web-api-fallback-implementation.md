# Web API Fallback Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让免费用户能通过手动配置网页 API token 使用插件，PRO 会员继续用 OpenAPI；OpenAPI 返回 10201 时自动切换。

**Architecture:** 新增 `fetchNotesWebApi` / `fetchNoteDetailWebApi` 函数，复用现有 `GetNoteNote` 类型；Settings 新增 `webApiToken` + `webCsrfToken` 字段；同步时根据凭证自动选择 API 模式。

**Tech Stack:** TypeScript, Preact, Vitest, Obsidian API, fetch

---

## File Map

| 文件 | 职责 |
|------|------|
| `src/types.ts` | Settings 接口新增字段 |
| `src/api.ts` | 新增 Web API 函数 + 10201 错误识别 |
| `src/sync.ts` | 同步引擎支持 API 模式切换 |
| `src/settings/index.tsx` | UI 新增网页 API 配置区域 |
| `src/i18n.ts` | 新增 UI 文本（英文 + 中文） |
| `tests/api.spec.ts` | Web API 函数测试 |
| `tests/types.spec.ts` | Settings 类型测试 |
| `docs/superpowers/specs/2026-05-15-web-api-fallback-design.md` | 设计文档（已存在） |

---

## Task 1: 更新 Settings 类型

**Files:**
- Modify: `src/types.ts:49-60`

- [ ] **Step 1: 添加 Web API 字段到 Settings 接口**

在 `apiToken` 和 `clientId` 下方添加：

```typescript
export interface Settings {
  apiToken: string;
  clientId: string;
  webApiToken: string;      // 网页版 JWT token
  webCsrfToken: string;     // 网页版 xi-csrf-token
  folderName: string;
  // ... 其他字段不变
}
```

- [ ] **Step 2: 更新 DEFAULT_SETTINGS**

在 `DEFAULT_SETTINGS` 中添加默认值：

```typescript
export const DEFAULT_SETTINGS: Settings = {
  apiToken: '',
  clientId: '',
  webApiToken: '',          // 新增
  webCsrfToken: '',         // 新增
  folderName: 'Get笔记',
  // ... 其他字段不变
};
```

- [ ] **Step 3: 添加测试验证新字段**

运行: `npm test -- tests/types.spec.ts`
预期: PASS（无破坏性变更）

- [ ] **Step 4: Commit**

```bash
git add src/types.ts
git commit -m "feat: add webApiToken and webCsrfToken to Settings"
```

---

## Task 2: 实现 Web API 函数和错误识别

**Files:**
- Modify: `src/api.ts:1-14`（顶部 import 和 BASE_URL）
- Modify: `src/api.ts:115-145`（现有 fetchNotes 后添加新函数）
- Modify: `src/api.ts:449-482`（现有 fetchAllNotes 后添加新函数）

- [ ] **Step 1: 更新 api.ts 顶部，添加 WEBAPI_BASE 常量**

将现有的：
```typescript
const BASE_URL = 'https://openapi.biji.com/open/api/v1';
```
改为：
```typescript
const OPENAPI_BASE = 'https://openapi.biji.com/open/api/v1';
const WEBAPI_BASE = 'https://get-notes.luojilab.com/voicenotes/web';
```

同时把后续所有 `${BASE_URL} 替换为 ${OPENAPI_BASE}`

- [ ] **Step 2: 在 api.ts 中添加 WebApiNote 类型定义**

在 `FetchNotesOptions` 接口后添加：

```typescript
// Web API response types
interface WebApiNoteListResponse {
  h: { c: number; e: string; s: number; t: number; apm: string };
  c: {
    total_items: number;
    list: WebApiNote[];
    has_more: boolean;
    next_cursor: string;
  };
}

export interface WebApiNote {
  id: string;
  note_id: string;
  source: string;
  entry_type: string;
  note_type: string;
  title: string;
  json_content: string;
  content: string;
  body_text: string;
  ref_content: string;
  topics: unknown[];
  book_topics: unknown[];
  tags: { id: string; name: string; type: string; visible: boolean; is_deleted: number; create_time: number; update_time: number; tag_type: string }[];
  is_ai_generated: boolean;
  attachments: { type: string; url: string; size: number; title: string; sub_title: string; duration: number; favicon: string }[];
  edit_time: string;
  created_at: string;
  updated_at: string;
  version: number;
  status: number;
  display_status: number;
  share_scope: number;
  is_author: boolean;
}

function webApiNoteToNote(webNote: WebApiNote): GetNoteNote {
  return {
    id: parseInt(webNote.note_id, 10),
    note_id: webNote.note_id,
    title: webNote.title,
    content: webNote.content,
    note_type: webNote.note_type as NoteType,
    source: webNote.source,
    tags: webNote.tags.map(tag => ({ name: tag.name })),
    created_at: webNote.created_at,
    updated_at: webNote.updated_at,
    attachments: webNote.attachments.map(att => ({
      type: att.type as 'audio',
      url: att.url,
      title: att.title,
      duration: att.duration,
    })),
  };
}
```

- [ ] **Step 3: 在 `fetchNotes` 函数后添加 `fetchNotesWebApi`**

```typescript
// Web API fetch functions (bypass OpenAPI paid requirement)
export async function fetchNotesWebApi(
  webToken: string,
  csrfToken: string,
  sinceId: string = '',
  limit: number = 20,
  signal?: AbortSignal
): Promise<{ notes: GetNoteNote[]; hasMore: boolean }> {
  const url = `${WEBAPI_BASE}/notes?limit=${limit}&since_id=${sinceId}&sort=create_desc`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${webToken}`,
      'xi-csrf-token': csrfToken,
      'x-request-id': String(Date.now()),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal,
  });

  if (res.status === 401) {
    throw new Error(t('error.invalidCredentials'));
  }

  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(t('error.apiFailed', { status: res.status, msg: text }));
  }

  const text = await res.text();
  const json = JSON.parse(text) as WebApiNoteListResponse;

  return {
    notes: json.c.list.map(webApiNoteToNote),
    hasMore: json.c.has_more,
  };
}
```

- [ ] **Step 4: 在 `fetchNoteDetail` 函数后添加 `fetchNoteDetailWebApi`**

```typescript
export async function fetchNoteDetailWebApi(
  noteId: string,
  webToken: string,
  csrfToken: string,
  signal?: AbortSignal
): Promise<Partial<GetNoteNote>> {
  const url = `${WEBAPI_BASE}/notes/${noteId}`;

  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${webToken}`,
      'xi-csrf-token': csrfToken,
      'x-request-id': String(Date.now()),
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    signal,
  });

  if (res.status === 401) {
    throw new Error(t('error.invalidCredentials'));
  }

  if (res.status < 200 || res.status >= 300) {
    const text = await res.text();
    throw new Error(t('error.apiFailed', { status: res.status, msg: text }));
  }

  const text = await res.text();
  const json = JSON.parse(text) as WebApiNoteListResponse;
  const note = json.c.list[0];
  if (!note) throw new Error('Note not found');

  return webApiNoteToNote(note);
}
```

- [ ] **Step 5: 在 `fetchAllNotes` 后添加 `fetchAllNotesWebApi` 生成器**

```typescript
// Web API async generator for fetching all notes
export async function* fetchAllNotesWebApi(
  webToken: string,
  csrfToken: string,
  signal?: AbortSignal,
  startCursor?: string | null
): AsyncGenerator<GetNoteNote[]> {
  let cursor = startCursor ?? '';

  while (true) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const { notes, hasMore } = await fetchNotesWebApi(webToken, csrfToken, cursor, 20, signal);

    if (notes && notes.length > 0) {
      yield notes;
    }

    if (!hasMore || notes.length === 0) break;
    cursor = notes[notes.length - 1].note_id;
  }
}
```

- [ ] **Step 6: 在文件末尾添加 API 模式选择函数**

```typescript
// Determine which API mode to use based on available credentials
export type EffectiveApiMode = 'openapi' | 'webapi';

export function getEffectiveApiMode(settings: {
  apiToken: string;
  clientId: string;
  webApiToken: string;
}): EffectiveApiMode {
  if (settings.apiToken && settings.clientId) {
    return 'openapi';
  }
  if (settings.webApiToken) {
    return 'webapi';
  }
  return 'openapi'; // fallback (will fail if credentials missing)
}

// Check if error is OpenAPI member-only error (code: 10201)
export function isMemberOnlyError(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('OpenAPI_ONLY_MEMBER') || err.message.includes('10201');
  }
  return false;
}
```

- [ ] **Step 7: 在 `apiRequest` 函数中添加 10201 错误识别**

在 `apiRequest` 函数的错误处理部分（`data.success === false` 判断前）添加：

```typescript
  // Handle OpenAPI paid-only error code 10201 — signals Web API fallback needed
  if (data.success === false) {
    const error = data.error as Record<string, unknown> | undefined;
    if (error?.code === 10201) {
      throw new Error('OpenAPI_ONLY_MEMBER');
    }
  }
```

- [ ] **Step 8: 更新 `fetchNotes` 中的 BASE_URL 引用**

将 `${BASE_URL}/resource/note/list` 改为 `${OPENAPI_BASE}/resource/note/list`

- [ ] **Step 9: 更新 `fetchNoteDetail` 中的 BASE_URL 引用**

将 `${BASE_URL}/resource/note/detail` 改为 `${OPENAPI_BASE}/resource/note/detail`

- [ ] **Step 10: 更新 `fetchOAuthDeviceCode` 中的 BASE_URL 引用**

将 `${BASE_URL}/oauth/device/code` 改为 `${OPENAPI_BASE}/oauth/device/code`

- [ ] **Step 11: 更新 `pollOAuthToken` 中的 BASE_URL 引用**

将 `${BASE_URL}/oauth/token` 改为 `${OPENAPI_BASE}/oauth/token`

- [ ] **Step 12: 写测试**

在 `tests/api.spec.ts` 末尾添加：

```typescript
import { describe, test, expect, vi } from 'vitest';
import { fetchNotesWebApi, fetchAllNotesWebApi, getEffectiveApiMode, isMemberOnlyError } from '../src/api';

// Mock fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Web API functions', () => {
  beforeEach(() => mockFetch.mockReset());

  test('getEffectiveApiMode prefers OpenAPI when available', () => {
    const mode = getEffectiveApiMode({
      apiToken: 'token',
      clientId: 'client',
      webApiToken: 'web',
    });
    expect(mode).toBe('openapi');
  });

  test('getEffectiveApiMode falls back to WebAPI when no OpenAPI token', () => {
    const mode = getEffectiveApiMode({
      apiToken: '',
      clientId: '',
      webApiToken: 'web',
    });
    expect(mode).toBe('webapi');
  });

  test('isMemberOnlyError detects 10201 error', () => {
    expect(isMemberOnlyError(new Error('OpenAPI_ONLY_MEMBER'))).toBe(true);
    expect(isMemberOnlyError(new Error('something 10201 something'))).toBe(true);
    expect(isMemberOnlyError(new Error('other error'))).toBe(false);
  });
});
```

- [ ] **Step 13: 运行测试验证**

运行: `npm test -- tests/api.spec.ts`
预期: PASS

- [ ] **Step 14: Commit**

```bash
git add src/api.ts tests/api.spec.ts
git commit -m "feat: add Web API functions and 10201 error detection"
```

---

## Task 3: 更新同步引擎支持 API 模式切换

**Files:**
- Modify: `src/sync.ts:2`（import 新函数）
- Modify: `src/sync.ts:447`（sync 方法中的 fetchAllNotes 调用）
- Modify: `src/sync.ts:532`（syncNoteIds 方法中的 fetchAllNotes 调用）

- [ ] **Step 1: 更新 import 语句**

将现有的：
```typescript
import { fetchAllNotes, fetchNoteDetail } from './api';
```
改为：
```typescript
import { fetchAllNotes, fetchNoteDetail, fetchAllNotesWebApi, fetchNoteDetailWebApi, getEffectiveApiMode, isMemberOnlyError } from './api';
```

- [ ] **Step 2: 修改 `sync` 方法中的 fetchAllNotes 调用（第 447 行附近）**

在 `sync` 方法开头添加 API 模式判断：

```typescript
async sync(modal?: SyncModal): Promise<SyncResult> {
  const apiMode = getEffectiveApiMode(this.settings);
  const useWebApi = apiMode === 'webapi';
  let autoSwitchedToWebApi = false;

  // ... 现有的 result, uidIndex, seenNoteIds 等初始化不变 ...

  try {
    if (useWebApi) {
      for await (const notes of fetchAllNotesWebApi(
        this.settings.webApiToken,
        this.settings.webCsrfToken,
        controller.signal
      )) {
        // ... 现有的页面处理逻辑不变 ...
      }
    } else {
      for await (const notes of fetchAllNotes(
        this.settings.apiToken,
        this.settings.clientId,
        controller.signal
      )) {
        // ... 现有的页面处理逻辑不变 ...
      }
    }
    // ...
  } catch (err) {
    // 如果 OpenAPI 报 10201 且用户有网页 API 凭证，自动切换
    if (!useWebApi && isMemberOnlyError(err) && this.settings.webApiToken) {
      this.app.notice('OpenAPI 需要会员，自动切换到网页 API 模式');
      autoSwitchedToWebApi = true;
      try {
        for await (const notes of fetchAllNotesWebApi(
          this.settings.webApiToken,
          this.settings.webCsrfToken,
          controller.signal
        )) {
          // 重试逻辑（复用上述逻辑）
        }
      } catch {
        throw err;
      }
    } else {
      throw err;
    }
  }
}
```

**注意**：`this.app.notice()` 需要传入 Obsidian App 实例。如果 `SyncEngine` 构造函数已有 `app` 参数，直接使用；如果没有，需要添加。

- [ ] **Step 3: 同样修改 `syncNoteIds` 方法（第 532 行附近）**

同样添加条件分支和 10201 自动切换逻辑。

- [ ] **Step 4: 运行测试验证**

运行: `npm test -- tests/sync.spec.ts tests/sync-engine.spec.ts`
预期: PASS

- [ ] **Step 5: Commit**

```bash
git add src/sync.ts
git commit -m "feat: support Web API mode in sync engine"
```

---

## Task 4: 更新 UI 添加网页 API 配置区域

**Files:**
- Modify: `src/settings/index.tsx`
- Modify: `src/i18n.ts`

- [ ] **Step 1: 在 i18n.ts 中添加新文本**

在 translations 对象中添加：

```typescript
// 英文
export const translations = {
  en: {
    // ... 现有文本 ...
    'settings.webApi.title': 'Web API (Free Users)',
    'settings.webApi.desc': 'Configure web API token for free users. Open Chrome DevTools (F12) → Network tab after logging into biji.com to find the token.',
    'settings.webApi.tokenPlaceholder': 'Authorization: Bearer xxx',
    'settings.webApi.csrfPlaceholder': 'xi-csrf-token: xxx',
    'settings.webApi.save': 'Save & Test Connection',
    'settings.webApi.hint': '⚠️ Token expires in ~8 days. Re-copy from DevTools when expired.',
    'settings.webApi.success': 'Connection successful',
    'settings.webApi.error': 'Connection failed',
    'settings.notice.proRequired': 'OpenAPI requires PRO membership. Free users: configure web API token below.',
    'sync.autoSwitchToWebApi': 'OpenAPI requires PRO, automatically switched to Web API mode',
  },
  // 中文
  zh: {
    'settings.webApi.title': '网页版 API（免费用户）',
    'settings.webApi.desc': '在 Chrome 中打开 biji.com 并登录，按 F12 打开开发者工具 → Network 标签，刷新页面后复制以下两个值：',
    'settings.webApi.tokenPlaceholder': 'Authorization: Bearer xxx',
    'settings.webApi.csrfPlaceholder': 'xi-csrf-token: xxx',
    'settings.webApi.save': '保存并测试连接',
    'settings.webApi.hint': '⚠️ Token 有效期约 8 天，过期后需重新从 DevTools 复制',
    'settings.webApi.success': '连接成功',
    'settings.webApi.error': '连接失败',
    'settings.notice.proRequired': 'OpenAPI 需要 Get笔记 PRO 会员。免费用户请在下方配置网页 API token',
    'sync.autoSwitchToWebApi': 'OpenAPI 需要会员，自动切换到网页 API 模式',
  },
};
```

**关键点**：`settings.webApi.hint` 需要用 ⚠️ 符号显性化提示用户注意有效期。

- [ ] **Step 2: 在 settings/index.tsx 中添加状态和处理函数**

在现有的 `useState` 声明区添加：

```typescript
const [webApiToken, setWebApiToken] = useState(settings.webApiToken);
const [webCsrfToken, setWebCsrfToken] = useState(settings.webCsrfToken);
const [webApiTestStatus, setWebApiTestStatus] = useState<'idle' | 'success' | 'error'>('idle');
const [webApiTestError, setWebApiTestError] = useState('');
```

添加处理函数：

```typescript
const handleWebApiTokenChange = useCallback((value: string) => {
  setWebApiToken(value.trim());
  updateSetting('webApiToken', value.trim());
}, [updateSetting]);

const handleWebCsrfTokenChange = useCallback((value: string) => {
  setWebCsrfToken(value.trim());
  updateSetting('webCsrfToken', value.trim());
}, [updateSetting]);

const handleTestWebApi = async () => {
  if (!webApiToken || !webCsrfToken) return;
  setWebApiTestStatus('idle');
  setWebApiTestError('');
  try {
    const { fetchNotesWebApi } = await import('../api');
    await fetchNotesWebApi(webApiToken, webCsrfToken, '', 1);
    setWebApiTestStatus('success');
    window.setTimeout(() => setWebApiTestStatus('idle'), 3000);
  } catch (err) {
    setWebApiTestStatus('error');
    setWebApiTestError(err instanceof Error ? err.message : String(err));
  }
};
```

- [ ] **Step 3: 在设置页面中添加网页 API 配置区域**

在 `{!hasCredentials && ...}` 提示条之后，或在 OpenAPI 凭证区下方添加：

```typescript
{/* 免费用户网页 API 配置 */}
<SettingItem
  name={t('settings.webApi.title')}
  description={t('settings.webApi.desc')}
>
  <div className="getnote-webapi-config">
    <div className="getnote-webapi-hint">{t('settings.webApi.desc')}</div>
    <input
      type="text"
      className="getnote-input"
      placeholder={t('settings.webApi.tokenPlaceholder')}
      value={webApiToken}
      onInput={(e) => handleWebApiTokenChange((e.target as HTMLInputElement).value)}
    />
    <input
      type="text"
      className="getnote-input"
      placeholder={t('settings.webApi.csrfPlaceholder')}
      value={webCsrfToken}
      onInput={(e) => handleWebCsrfTokenChange((e.target as HTMLInputElement).value)}
    />
    <div className="getnote-webapi-actions">
      <button
        className="mod-cta"
        onClick={() => { void handleTestWebApi(); }}
      >
        {t('settings.webApi.save')}
      </button>
    </div>
    {webApiTestStatus === 'success' && (
      <span className="getnote-connection-success">{t('settings.webApi.success')}</span>
    )}
    {webApiTestStatus === 'error' && (
      <span className="getnote-connection-error">
        {t('settings.webApi.error')}: {webApiTestError}
      </span>
    )}
    <div className="getnote-input-hint">{t('settings.webApi.hint')}</div>
  </div>
</SettingItem>
```

- [ ] **Step 4: 添加 CSS 样式（可选，在 styles.css 中添加）**

```css
.getnote-webapi-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.getnote-webapi-hint {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 4px;
}

.getnote-webapi-actions {
  display: flex;
  gap: 8px;
}
```

**UI 显性化要点**：
1. `hint` 文本使用 ⚠️ 符号开头，显眼提示用户注意有效期
2. 设置页面顶部显示橙色/红色提示条，提醒 OpenAPI 需要会员
3. 网页 API 配置区域使用不同背景色区分（如浅蓝色）

- [ ] **Step 5: 本地构建验证**

运行: `npm run build`
预期: 无编译错误

- [ ] **Step 6: Commit**

```bash
git add src/settings/index.tsx src/i18n.ts styles.css
git commit -m "feat: add Web API config UI section"
```

---

## Task 5: 集成测试和手动验证

**Files:**
- Modify: `tests/api.spec.ts`

- [ ] **Step 1: 添加 Settings 默认值测试**

```typescript
test('DEFAULT_SETTINGS includes web API fields', () => {
  expect(DEFAULT_SETTINGS.webApiToken).toBe('');
  expect(DEFAULT_SETTINGS.webCsrfToken).toBe('');
});
```

- [ ] **Step 2: 运行全量测试**

运行: `npm test`
预期: 全部 PASS

- [ ] **Step 3: 本地部署测试**

```bash
npm run build && cp main.js manifest.json styles.css "/Users/zhengyan/Downloads/同步空间/9_个人笔记/郑大师的笔记本/.obsidian/plugins/obsidian-getnote-importer/"
```

- [ ] **Step 4: 在 Obsidian 中手动测试**

1. 打开设置页面，确认 UI 显示正常
2. 配置网页 API token，点击"保存并测试连接"
3. 点击"同步笔记"，确认笔记正常同步

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete Web API fallback feature

- Settings: add webApiToken and webCsrfToken fields
- API: add fetchNotesWebApi, fetchNoteDetailWebApi, fetchAllNotesWebApi
- API: detect 10201 error and support auto-fallback to Web API
- Sync: integrate Web API mode in sync engine
- UI: add Web API config section in settings page
- i18n: add Chinese/English text for new UI elements
- Tests: add unit tests for API mode switching

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## 依赖关系

```
Task 1 → Task 2 → Task 3 → Task 4 → Task 5
(类型定义)  (API函数)  (同步引擎)  (UI)  (测试)
```

Task 1 必须先完成，因为 Task 2-5 依赖新的 Settings 类型。