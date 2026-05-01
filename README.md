# GetNote Importer

[![Obsidian Plugin](https://img.shields.io/badge/Obsidian-Plugin-blueviolet?style=flat-square)](https://obsidian.md)
[![GitHub release (latest by date)](https://img.shields.io/github/v/release/AndyZhengyan/obsidian-getnote-importer?style=flat-square)](https://github.com/AndyZhengyan/obsidian-getnote-importer/releases)
[![GitHub stars](https://img.shields.io/github/stars/AndyZhengyan/obsidian-getnote-importer?style=flat-square)](https://github.com/AndyZhengyan/obsidian-getnote-importer)
[![License](https://img.shields.io/github/license/AndyZhengyan/obsidian-getnote-importer?style=flat-square)](LICENSE)

> 将 Get笔记 App 的笔记同步到 Obsidian 本地 vault，支持增量同步、自动定时同步和选择性同步。

![](./images/demo.gif)

## 功能

| 功能 | 说明 |
|------|------|
| **增量同步** | 只拉取新增或修改的笔记，不重复写入 |
| **选择性同步** | 先勾选要同步的笔记，再执行同步 |
| **定时自动同步** | 可配置间隔，后台静默同步 |
| **按类型分类** | 自动按纯文本 / 链接笔记 / 录音等分类存放 |
| **标题文件名** | 使用笔记标题作为文件名，易于辨认 |
| **时间戳前缀** | 可配置时间戳前缀（如 `YYYY-MM-DD`），文件名更整洁 |
| **冲突处理** | 标题重复时自动加数字后缀，不会覆盖不同笔记 |
| **迁移友好** | 笔记内容变化时自动重命名文件，保留笔记位置 |

## 安装

### 方法一：BRAT（推荐）

1. 在 Obsidian 中安装 **BRAT** 社区插件
2. 点击 `Settings → Community Plugins → BRAT → Add a beta plugin`
3. 填入仓库地址：`https://github.com/AndyZhengyan/obsidian-getnote-importer`
4. 启用 GetNote Importer 插件

### 方法二：手动安装

1. 从 [GitHub Releases](https://github.com/AndyZhengyan/obsidian-getnote-importer/releases/latest) 下载最新版本的 `main.js`、`manifest.json`、`styles.css`
2. 放入 `.obsidian/plugins/obsidian-getnote-importer/` 目录
3. 在 `Settings → Community Plugins` 中启用

## 获取 API 凭证

> ⚠️ 凭证仅用于访问 Get笔记开放平台 API，不会被上传到任何第三方。

1. 打开 Get笔记 App → 设置 → 开放平台
2. 创建应用，获取 **Token** 和 **Client ID**
3. 在插件设置中填入对应凭证

## 使用

### 快速同步

点击设置面板中的 **立即同步** 按钮，或使用命令面板（`Ctrl/Cmd+P` → `Get笔记: 同步笔记`）。

### 选择性同步

点击 **选择性同步** 按钮，勾选要同步的笔记后点击同步。

### 定时同步

在设置中开启 **定时同步**，配置同步间隔和是否在启动时同步。

## 目录结构

```
vault/
└── Get笔记/           ← 可在设置中自定义文件夹名
    ├── 纯文本/
    │   └── 会议记录.md
    ├── 链接笔记/
    │   └── 2026-04-30_文章摘录.md
    └── 录音长录/
        └── 2026-04-29_录音摘要.md
```

## 文件命名规则

| 情况 | 文件名示例 |
|------|-----------|
| 有标题 | `会议记录.md` |
| 无标题（取正文前 20 字） | `这是笔记的第一段文字...md` |
| 有前缀 `YYYY-MM-DD` | `2026-04-30_会议记录.md` |
| 标题冲突 | `会议记录-2.md` |

> 标题中的非法字符（`\ / : * ? " < > |`）会被自动过滤。

## 设置项

| 设置项 | 说明 | 默认值 |
|--------|------|--------|
| API Token | Get笔记开放平台 Token | — |
| Client ID | Get笔记开放平台 Client ID | — |
| 目标文件夹 | vault 内子目录名 | `Get笔记` |
| 最大同步天数 | 只同步 N 天内更新的笔记，0 = 不限制 | `30` |
| 文件名前缀（时间戳） | 格式如 `YYYY-MM-DD` 或 `YYYYMMDD_HHmm` | 空 |
| 定时同步 | 开启后自动定时同步 | 关闭 |
| 同步间隔（分钟） | 定时同步间隔，最小 5 分钟 | `30` |
| 启动时同步 | Obsidian 启动时自动同步一次 | 开启 |

## 同步机制

1. 同步开始时扫描 vault，建立 **uid → 文件** 索引
2. 每条笔记通过 `note_id`（存储在 frontmatter 的 `uid` 字段）判断是否为同一笔记
3. 若笔记已存在，比较 `updated_at` 判断是否需要更新
4. 若标题变化，自动重命名文件（不丢失编辑历史）

## 已知限制

- Detail API 返回 404，暂不支持附件（图片/音频）下载
- 录音笔记同步的是 AI 生成的文字摘要，非原始音频
- 链接笔记同步的是摘录内容，非原始网页

## FAQ

**Q: 同步后文件名还是数字 ID？**
A: 请确保插件已更新到最新版本，重新加载插件后再次同步。

**Q: 定时同步没有生效？**
A: 检查设置中是否已开启"定时同步"，并确认"同步间隔"填写正确（最小 5 分钟）。

**Q: 同步失败怎么排查？**
A: 打开 Obsidian 开发者工具（`View → Toggle Developer Tools`），在控制台查看错误信息。

## 技术栈

- **语言**：TypeScript
- **构建**：esbuild
- **UI 框架**：Preact（轻量 React 替代）
- **测试**：Vitest

## 支持与反馈

- 🐛 发现 bug？请提交 [GitHub Issue](https://github.com/AndyZhengyan/obsidian-getnote-importer/issues)
- 💡 有功能建议？欢迎提交 [Discussion](https://github.com/AndyZhengyan/obsidian-getnote-importer/discussions)
- ⭐ 觉得好用？给个 Star！

## License

MIT
