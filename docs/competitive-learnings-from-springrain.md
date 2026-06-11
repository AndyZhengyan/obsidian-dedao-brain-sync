# springrain1/get-to-obsidian 对标分析与借鉴规划

> 对比日期：2026-06-11
> 调研对象：
> - **我方** `obsidian-dedao-brain-sync` v1.2.0，main + 10 个 PR（最新 1.2.0 含知识库同步、tag 规范化、tag-aware picker）
> - **对方** `springrain1/get-to-obsidian` v3.7.3，CHANGELOG 声称到 3.7 但 `lib/` 仅有 v2.x 同步管线

---

## 0. TL;DR（先看这里）

- **路线根本不同**。对方走 **Playwright 浏览器自动化 + ZIP 导入**（依赖 Playwright + 桌面端）。我方走 **OpenAPI + Web API 同步**（支持移动端）。
- **对方 CHANGELOG 3.4~3.7 的功能（语义搜索、侧边栏 RAG、全局配额管理）在 `lib/` 里没有任何实现代码**——`main.js` 4MB 是打包产物含 Playwright，源代码开源度极低（仓库仅 1 个空 commit）。**直接"抄"路径不存在**。
- **可借鉴集中在 ZIP 导入管线的工程细节**：HTML→Markdown 转换鲁棒性、附件分类与零拷贝、移动端/桌面端回退、附件状态追踪。
- **建议按"功能差 / 工程差 / 体验差"三类拆 8 件事**做规划，**不是照搬**，而是把对方宣称的能力用**我们现有的 API 路径**重新实现。

---

## 1. 双方能力地图对照

| 维度 | 我方 v1.2.0 | 对方 v3.7.3（CHANGELOG） | 对方 `lib/` 实际 | 差距 / 备注 |
|---|---|---|---|---|
| **同步通道** | OpenAPI REST + Web API + 浏览器 Bearer | Playwright 浏览器自动化 + ZIP 导入 + OpenAPI | ZIP + Playwright 主导 | 我方移动端友好；对方桌面-only（但 manifest 标 `isDesktopOnly: false`，可执行性可疑） |
| **鉴权** | OpenAPI Key / Web Bearer JWT | 短信验证码 + Playwright 持久化 cookie | auth.ts 100 行 | 我方更现代，对方依赖 Playwright |
| **笔记拉取** | 分页列表 + 详情按需 | ZIP 一次性全量 | core.ts 解析 HTML | 我方增量更精细 |
| **笔记类型** | 5+ 种：plain_text/recorder_audio/img_text/link/knowledge_base/subscribed_knowledge | text/audio/image/canvas/moments | core.ts 全转 md | 我方缺 Canvas / Moments 可视化产物 |
| **HTML→Markdown** | 我们解析的是 API 返回的纯文本 + 附件元数据，无需 Turndown | **完整 Turndown 引擎**：pre/code 块、列表嵌套、GFM 表格、`<hr>`、`<mark>`、`<audio>`、`<img>`、`<a>` 附件 | core.ts:137-338 | 我方不需要 Turndown（API 已给结构化数据），但**附件 HTML 转 embed 的鲁棒性**值得借鉴 |
| **HTML 防呆** | — | 检测 `<p>` 误吞块级元素，逐个删除文本节点直到遇到块级元素 | core.ts:466-482 | **学习点**：节点删除前对父节点结构做断言 |
| **附件分类** | 按 `type: image/audio` 二分 | 按扩展名细分类 image/audio/video/document，可独立开关 | importer.ts:18-23 | **学习点**：设置项可让用户选"我只要图片和音频，不要视频和 PDF" |
| **附件复制** | `app.vault.createBinary()` | **零拷贝**：`adapter.getBasePath()` 可用时 `fs.copyFile` 走 Node API，mobile 回退到 ArrayBuffer | importer.ts:74-104 | **学习点**：桌面端走 Node fs 速度明显更快 |
| **附件状态追踪** | 仅依赖 `getAbstractFileByPath` 检查 | 显式 `copiedAttachments: string[]` 数组，与 HTML 转换联动 | core.ts:21, importer.ts:222 | **学习点**：HTML 转换时**先问**附件是否已复制，决定 embed 链接还是保留 alt 文本 |
| **HTML 实体解码** | API 不会给原始 HTML | 显式 `decodeHtmlEntities` + `<pre><code>` 内解码 | core.ts:118-134, 149 | 我方用 API 没这问题，但对接第三方 HTML 时可参考 |
| **双向同步** | ✅ `ReverseSyncEngine` + `LocalUploadModal` 上传 plain_text/link | CHANGELOG 写"3.5 双向同步" | lib/ 无实现 | **对方宣称无实现** |
| **知识库 / 订阅** | ✅ 1.2.0 新增：知识库创建+订阅、tag-aware picker | CHANGELOG 3.3 写"知识库同步" | lib/ 无实现 | 对方**宣称无实现** |
| **语义搜索 / RAG** | ❌ 无 | CHANGELOG 3.4 写"云端向量搜索+侧边栏+实时跟随" | lib/ 无实现 | 营销话术 |
| **配额管理** | ❌ 无（仅在 auto sync 失败时停掉开关） | CHANGELOG 3.7 写"全局配额+侧栏可视化+断路器 10203" | lib/ 无实现 | 营销话术 |
| **自动同步** | ✅ 5 分钟粒度 + 启动同步 + `lastSyncEndTimestamp` 增量 | 启动同步 + 每小时 | main.ts:124-134 | 对方粒度固定 1 小时，**不如我方灵活** |
| **增量同步** | ✅ uid 索引 + modified 对比 | `syncedMemoIds: string[]` 数组比对 | importer.ts:18 | 我方更精细（uid + 时间戳），对方只比对 ID |
| **Canvas 视图** | ❌ 无 | ✅ `Get Canvas.canvas` 三种模式（链接/内容/skip），三种尺寸 | canvas.ts | **可借鉴** |
| **Moments 时间线** | ❌ 无 | ✅ `Get Moments.md` YAML + `![[wikilink]]` 串接所有笔记 | moments.ts | **可借鉴** |
| **i18n** | ✅ 581 行 i18n.ts，zh + en 全覆盖 | ❌ 全部硬编码中文 | 0 行 | **我方更优** |
| **测试** | 26 个 spec（vitest） | 0 测试 | — | **我方更优** |
| **构建 / 类型** | Preact + TS + esbuild + Bun | TS + esbuild + Node | — | 持平 |

---

## 2. springrain1 仓库的"真相"

为了避免误判，再用工具验证一次：

- `git log --oneline`：**只有 1 个 commit**（`798fa33 Release v3.7.3 - Simplify plugin name to 'Dedao Brain Importer'`），CHANGELOG 上 3.0~3.7 的历史都不可信。
- `main.js` 4MB：**打包了 Playwright + 三个 Chromium 子依赖**，所以体积异常大。
- 实际可读源码仅 **~2000 行**：`core.ts` 560 行（HTML 转换）、`importer.ts` 327 行（解压+复制）、`exporter.ts` 120 行（Playwright 自动化）、`main_ui.ts` 515 行（Modal 拼装）。

**结论**：对方 3.4~3.7 的功能**全部没开源**，或者在闭源 main.js 里。直接看代码学不到，只能当"竞品宣称"参考。

---

## 3. 可借鉴的工程细节（按性价比排序）

### 3.1 P0：附件零拷贝 + 分类开关

**对方做法**（`importer.ts:74-104`）：
```ts
const vaultBase = (this.app.vault.adapter as any).getBasePath?.();
if (vaultBase) {
  await fs.copyFile(sourcePath, path.join(vaultBase, targetPath)); // 桌面端零内存
} else {
  const buffer = await fs.readFile(sourcePath);
  await this.app.vault.adapter.writeBinary(targetPath, buffer.buffer.slice(...));
}
```

**我方现状**（`sync.ts:241-247`）：所有附件下载都走 `fetch().arrayBuffer()` + `app.vault.createBinary()`，没有"本地 vault 走 fs"快路径。**预期收益**：桌面端大附件（mp4/pdf）写入速度可提 5-10×。

**改造方案**：
- 新增 `src/utils/vault-fs.ts`，封装 `tryWriteBinary(path, arrayBuffer)`，内部尝试 `adapter.getBasePath()` + `fs.writeFile` 走快路径，移动端自动回退。
- 在 `downloadAudioAsset` / `downloadImageAsset` 里调它。

### 3.2 P0：附件分类开关

**对方做法**（`importer.ts:18-23, 363-385`）：
```ts
const ATTACHMENT_EXTENSIONS = {
  image: ['jpg','jpeg','png','gif','webp','heic','bmp','svg'],
  audio: ['mp3','m4a','wav','aac','ogg','flac'],
  video: ['mp4','mov','avi','mkv','webm'],
  document: ['pdf','doc','docx','ppt','pptx','xls','xlsx','txt','md']
};
// 设置项 4 个 checkbox
```

**我方现状**：`sync.ts` 用 `isImageAttachment` 把 image 之外全忽略，视频/文档/PDF 直接丢弃。**预期收益**：用户能选择性保留 PDF 附件（学习场景高频需求）。

**改造方案**：
- 在 `Settings` 加 `attachmentImport: { image, audio, video, document: boolean }`。
- 在 `downloadAudioAsset` / `downloadImageAsset` 之外加 `downloadGenericAsset(url, type, ext)`。
- `settings-tab.tsx` 加 4 个 checkbox。

### 3.3 P1：HTML 解析鲁棒性（迁移防御）

**对方做法**（`core.ts:466-482`）：
```ts
// 源 HTML 若缺失 </p> 闭合，node-html-parser 会将后续 hr/h2 误认为该 p 的子元素
// 防御：逐个删除前面的文本节点和 .tag span，遇到块级元素就停止
if (p.querySelector('hr') || p.querySelector('h2') || p.querySelector('h3') || ...) {
  for (const child of [...p.childNodes]) {
    if (child.nodeType === 1) {
      const tag = (child as any).rawTagName?.toUpperCase();
      if (['HR','H2','H3','UL','OL','P','DIV'].includes(tag)) break;
    }
    child.remove();
  }
} else {
  p.remove();
}
```

**我方现状**：`note-parser.ts:78-119` 直接组装 frontmatter，**我们消费的不是 HTML**，是 API 返回的纯文本 + 附件元数据，所以这条**不直接适用**。但同一类**"删东西前先验证父节点结构"**的防御思想可以用在**用户编辑后的 reverse-sync 内容解析**上——`reverse-sync.ts:49-75` 的 `parseSimpleFrontmatter` 现在直接相信用户 markdown，遇到半残的 YAML 会**整体返回 null**（即直接退化为"全文件当 body"），这其实和对方 v3.0 修的"内容吞没 bug"是一类问题。

**改造方案**：
- `reverse-sync.ts` 增加"行级容错"：单行解析失败时跳过该字段而不是 abort 整个 frontmatter。
- 增加 fixture 测试：故意构造半残 YAML（缺 `---` 闭合、内嵌冒号未转义、tags 写成 JSON 对象等），验证"降级不丢笔记"。

### 3.4 P1：附件状态追踪

**对方做法**：`copiedAttachments: string[]` 在 HTML 转换前**先建好**，Turndown rule 里查这个数组——已复制就 embed 链接，未复制就保留 alt 文本。

**我方现状**：`sync.ts` 写 `assetPaths` 之后渲染，时间线是"先下完，再渲染"。这对**同步新笔记**是好的，但**对已有笔记的"补图"场景**（比如用户新启用了 video 导入，需要为已同步的笔记补下视频附件）会全部重下。

**改造方案**：
- 不需要现在做；**等 P0-3.2 分类开关落地后**再做"按 uid 索引批量补下"。

### 3.5 P1：Canvas / Moments 产物

**对方做法**：
- `canvas.ts`：把所有同步的笔记按 `dateTime` DESC 排成网格，每张卡片 230×280/300×350/500×500，链接模式只放 `![[wikilink]]`，内容模式把全文塞进 text 节点。
- `moments.ts`：单文件 `Get Moments.md`，YAML 头是 `createdDate + tags`，正文用 `![[wikilink]]` 串接。

**我方现状**：完全没有可视化产物。**预期收益**：用户进入 vault 第一眼能看到"今天新加了哪些笔记"的概览。

**改造方案**：
- 新增 `src/post-processing/canvas.ts` + `src/post-processing/moments.ts`，在 `sync()` 末尾调一次。
- 设置项 `postProcess: { canvas: 'link' | 'content' | 'off', moments: boolean, canvasSize: 'S'|'M'|'L' }`。
- 关键差异：**对方的 canvas 节点是 vault 文件引用（`![[note]]`）**，我方要支持 Obsidian 的 canvas JSON spec（`{type: 'file', file: 'path/to/note.md', x, y, width, height}`），写完用 `app.vault.create` 落盘。

### 3.6 P1：CHANGELOG 宣传但没开源的能力——按我们 API 路径重做

下面三项都是对方**宣称**有、但 `lib/` 里没代码的。**既然我们走 OpenAPI 路径比对方干净**，如果要做就直接在 API 路径上做：

- **配额管理（quota）**：OpenAPI 已经有 quota 端点（或在响应头里），我方现在只用了 `lastSyncEndTimestamp` 增量，**完全可以**额外拉 quota、UI 显示"今日剩余 X 次"，quota 耗尽（10203）时自动停掉 auto sync。**这恰好是 `main.tsx:357-363` 的"isQuotaExceeded"分支的延伸**——现在已经能识别，只是没可视化。
- **侧边栏 RAG 搜索**：注册一个 `ItemView` 类型的 `ItemView` 挂在右栏，对话框接受 query，调用 OpenAPI 的 `search` 端点（如果存在）或 fallback 到"按 tag/title 在 uidIndex 里搜"。**注：OpenAPI 不一定有 RAG，**先做"本地 uid 索引 + tag 模糊匹配"的轻量版。
- **上下文菜单"用选中文字搜索"**：注册 editor-menu 项 `Search with selected text`，把当前选中文本送进上面的 RAG 面板。**这要求上面侧边栏先有**。

### 3.7 P2：移动端 ZIP 导入回退

**对方做法**（`main_ui.ts:159-200`）：桌面端用 `file.path` 走 Node 路径，移动端没有 path 就用 Web Stream API 走 `file.stream().getReader()` → `fs.createWriteStream()`。

**我方现状**：我们**完全不需要这个**——OpenAPI 通道天然不依赖文件系统。但**`local-upload-modal.tsx` 的文件选择**可以借鉴这个稳健性：当用户拖入文件而非点选时，`onchange` 不一定触发，**目前没有 drag-and-drop 支持**。

**改造方案**：
- 给 `local-upload-modal` 加 `dragover`/`drop` 监听，复用 `onchange` 处理逻辑。
- 顺便支持多文件批量上传（目前是一次一个文件）。

### 3.8 P2：增量失败重试 + 同步历史分组

**对方做法**：同步历史只显示 lastSyncTime + 已同步数（`main_ui.ts:413-426`），很简陋。

**我方现状**：`SyncHistoryEntry` + `sync-history-modal.tsx` 已经完整。**我方更优，不做。**

---

## 4. 不需要学的

- **Playwright 浏览器自动化**：与我们 OpenAPI 路线冲突，**显式不做**（CLAUDE.md 已规定 fetch，不许 requestUrl，更不可能引 Playwright）。
- **ZIP 解压管线**（decompress + HTML 解析）：**不适用**，我们走 API。
- **短信验证码登录**：我们有 OpenAPI Token + Web Bearer 两种免登录方式，**用不到**。
- **flomo 历史包袱**：对方从 flomo → Get → Dedao Brain 三次重命名，留了一堆兼容代码。**不学**——我们 1.0.0 起步干净。

---

## 5. 推荐的实施序列

按"功能价值 / 实现成本"排：

| 优先级 | 任务 | 估时 | 价值 | 风险 |
|---|---|---|---|---|
| **P0** | 附件零拷贝快路径（3.1） | 0.5d | 桌面端大文件 5-10× 加速 | 低，纯本地 IO |
| **P0** | 附件分类开关（3.2） | 1d | 用户能选要不要 PDF/视频 | 低，纯设置 + 下载过滤 |
| **P1** | Canvas / Moments 产物（3.5） | 1.5d | vault 入口体验跃升 | 中，Canvas JSON 节点尺寸需调优 |
| **P1** | quota 可视化（3.6 之一） | 1d | 用户能看到"还剩多少次同步" | 低，OpenAPI 配额端点假设存在，否则跳过 |
| **P1** | reverse-sync frontmatter 行级容错（3.3） | 0.5d | 减少"我编辑了 YAML 后上传失败"投诉 | 中，需要新 fixture |
| **P2** | 本地 vault 侧栏 RAG 搜索（3.6 之二） | 2d | 双向同步的"反向"——从云端拉回来 | 高，依赖 OpenAPI 是否有 search 端点 |
| **P2** | 上下文菜单"选中文字搜"（3.6 之三） | 0.5d | 与 P2 侧栏联动 | 低，依赖侧栏 |
| **P2** | drag-and-drop 文件上传（3.7） | 0.5d | 上传体验 | 低 |

**累计**：~7.5 工作日。**第一个里程碑（1.2.1）** = P0 两项 + P1 配额可视化 = 2.5d，可独立 ship。

---

## 6. 风险与决策

- **侧栏 RAG 搜索**如果 OpenAPI 不提供 `search` 端点，**降级为本地 uid 索引 + tag 模糊匹配**，价值会大幅缩水。建议先用 `WebFetch` 探活 `https://openapi.biji.com/open/api/v1/search` 是否存在，不存在就推迟到 1.3.x。
- **Canvas 节点大小**要和用户 vault 实际使用情况对齐；建议默认 M 尺寸，提供 3 档。
- **附件零拷贝**是性能优化，肉眼难感知，建议**先在 dev 自测大 PDF（>50MB）对比耗时**，确认有 5× 才 ship。
- **不要复制对方的本地 ZIP 路径**。理由：OpenAPI 已经能拿到结构化数据，HTML→MD 这条路从根上就不该走。**如果未来 OpenAPI 挂了、退回到 WebAPI 也不需要 HTML 解析**，所以对方这条路**对我们没复用价值**。

---

## 7. 关联文档

- `docs/web-mode-manual-token.md` — 现有 Web 模式使用文档（**对方完全没有这套**）
- `src/i18n.ts` — 我方 581 行中英双语（**对方 0 行 i18n**）
- `tests/` — 26 个 spec（**对方 0 个测试**）
- `CLAUDE.md` — 我们的发版规范和"统一 fetch，禁 requestUrl"硬规定
