# Dedao Brain Sync

[English](./README.md) | [中文](./README_zh.md)

[![Community Plugin](https://img.shields.io/badge/Obsidian-Community%20Plugin-7c3aed?style=flat-square&logo=obsidian)](https://community.obsidian.md/plugins/dedao-brain-sync)
[![Latest Release](https://img.shields.io/github/v/release/AndyZhengyan/obsidian-dedao-brain-sync?style=flat-square)](https://github.com/AndyZhengyan/obsidian-dedao-brain-sync/releases)
[![Downloads](https://img.shields.io/badge/dynamic/json?url=https%3A%2F%2Fraw.githubusercontent.com%2Fobsidianmd%2Fobsidian-releases%2Fmaster%2Fcommunity-plugin-stats.json&query=%24.dedao-brain-sync.downloads&style=flat-square&label=downloads)](https://community.obsidian.md/plugins/dedao-brain-sync)
[![CI](https://img.shields.io/github/actions/workflow/status/AndyZhengyan/obsidian-dedao-brain-sync/ci.yml?branch=main&style=flat-square)](https://github.com/AndyZhengyan/obsidian-dedao-brain-sync/actions)
[![License](https://img.shields.io/github/license/AndyZhengyan/obsidian-dedao-brain-sync?style=flat-square)](LICENSE)

Bidirectionally sync your notes, highlights, links, recordings, and AI summaries from Dedao Brain (得到大脑, formerly GetNote / Get笔记) into Obsidian as local Markdown files you can organize, search, and link over the long term.

> The Obsidian Community Plugin directory requires `manifest.name` to use Basic Latin characters, so the marketplace listing is shown as `Dedao Brain Sync`. The plugin settings page and Chinese copy use the primary brand `得到大脑（原Get笔记）Sync`.

## Why it works

- **Not a one-shot export**: The official export is offline HTML. This plugin syncs each note into its own Markdown file.
- **Stable, resumable downloads**: Supports incremental sync, scheduled sync, startup sync, and sync checkpoints.
- **Precise selection**: Sync by date range, or pick specific notes from the remote list.
- **Local-to-remote upload**: Push one or more Markdown files from Obsidian to Dedao Brain. Upload is manual and never triggered by scheduled sync.
- **Readable files**: Notes are organized by type, named by title first, with optional date/time prefixes.
- **Recording-friendly**: When the API returns audio and transcripts, both are saved.
- **Mobile-compatible**: Network calls use Obsidian `requestUrl`, which works on both desktop and mobile Obsidian.

## Features

| Feature | Description |
| --- | --- |
| Incremental sync | New notes are created, existing notes are updated, unchanged notes are skipped. |
| Sync by date | Pull notes from Dedao Brain by start date or "last N days". |
| Sync by note | Pick specific notes from the remote list. |
| Scheduled sync | Pull from Dedao Brain at a configurable interval. |
| Startup sync | Run a download sync once when Obsidian starts. |
| Local upload | Choose a vault folder and one or more Markdown files to create in Dedao Brain. |
| Type-based filing | Text, link, recording, local audio, and others are filed into separate folders. |
| Sync history | Shows per-note added / updated / skipped / failed results. |

## Screenshots

Settings page: API credentials, target folder, filename prefix, scheduled sync, and upload entry.

![Settings page](docs/screenshots/settings.png)

Manual sync dialog: sync notes by date or by day range.

![Manual sync](docs/screenshots/manual-sync.png)

Sync history dialog: review per-note results from each run.

![Sync history](docs/screenshots/sync-history.png)

Synced recording note: audio file, transcript, AI summary, and frontmatter metadata.

![Synced recording](docs/screenshots/synced-recording.png)

## Installation

### From the Obsidian Community Plugins

[![Available on Obsidian](https://img.shields.io/badge/Obsidian-Community%20Plugin-7c3aed?style=flat-square&logo=obsidian)](https://community.obsidian.md/plugins/dedao-brain-sync)

1. Open `Settings -> Third-party plugin -> Browse`.
2. Search for `Dedao Brain Sync`, `得到大脑`, or the legacy name `GetNote` / `Get笔记`.
3. Install and enable the plugin.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/AndyZhengyan/obsidian-dedao-brain-sync/releases/latest).
2. Put them in:

```text
<your-vault>/.obsidian/plugins/dedao-brain-sync/
```

3. Restart Obsidian and enable `Dedao Brain Sync`.

> The plugin folder name is `getnote-importer` (matching the `id` in `manifest.json` for backward compatibility with the existing listing); the repository itself has been renamed to `obsidian-dedao-brain-sync`. Legacy GetNote Importer `data.json` is migrated automatically on first startup.

## Getting API credentials

> **Note**: The Dedao Brain (得到大脑, formerly GetNote) OpenAPI requires a **Dedao Brain PRO** membership. The OpenAPI has significant operational cost, so the Dedao Brain team confirmed it is currently available to paid members only. If you are on the free tier, the OpenAPI endpoints will not return data.

Credentials are stored only in your local Obsidian plugin data, and are used to access the auth mode you select.

### OpenAPI mode (recommended for long-term use)

1. Open the Dedao Brain app.
2. Go to `Settings -> Open Platform`.
3. Create an application, then copy the `Token` and `Client ID`.
4. In `Settings -> Dedao Brain Sync`, choose `OpenAPI auth (members)` and paste both values.
5. You can also use the OAuth button on the settings page to fetch credentials automatically.

### Web mode (manual token)

If your account cannot use OpenAPI, choose `Temporary auth`. This mode reuses your existing Dedao Brain web session in the browser and does not require a `Client ID`.

Step-by-step English guide: [Web Mode Manual Token Guide](docs/web-mode-manual-token.md).

To copy the token:

1. Open `https://www.biji.com/note` in Chrome or Edge and sign in.
2. Open browser DevTools: `F12` or `Ctrl + Shift + I` on Windows / Linux; `Command + Option + I` on Mac.
3. Switch to the `Network` panel and filter by `Fetch/XHR`.
4. Reload the web app, or open the note list / any note, to trigger API requests.
5. In the request list, open one whose name looks like `notes?...` or `list?...`; the `Host` in the right-hand Headers is usually `get-notes.luojilab.com`.
6. Under `Request Headers`, copy the full `Authorization` value.
7. Paste it into the Token field under `Settings -> Dedao Brain Sync -> Temporary auth`.
8. Click `Test connection`, then run `Sync by date` or `Sync by note` once it succeeds.

The value usually starts with `Bearer eyJ...`. The plugin accepts a full `Bearer ...` string, or just the JWT token. Do not paste an OpenAPI `gk_...` token into Temporary auth. A Web token is a browser session credential and can expire; if you see `401`, `403`, or `Web Token expired`, refresh the web app and re-copy the `Authorization` header.

## Usage

### Sync from Dedao Brain to Obsidian

Click `Sync by date` on the settings page, or run the command:

```text
Dedao Brain Sync: Sync notes
```

### Pick specific remote notes

Click `Sync by note` and pick the notes you want from the remote list. Useful for topic cleanup, project reorganization, or one-off backfills.

### Scheduled sync

When scheduled sync is enabled, the plugin pulls from Dedao Brain at the configured interval. Scheduled sync only downloads remote changes and never uploads local notes.

### Upload from Obsidian to Dedao Brain

In the `Upload from Obsidian to Dedao Brain` area of the settings page, click `Upload by note`, pick a local folder, and select one or more Markdown files.

Upload is **create-only sync**:

- Notes with empty bodies are skipped.
- Notes that already have a `uid` and are confirmed to exist remotely are skipped, to avoid duplicates.
- Existing content in Dedao Brain is never overwritten.
- Upload is never triggered automatically by scheduled sync.

## Output layout

By default, notes are written into the target folder.

```text
vault/
└── 得到大脑/
    ├── 纯文本/
    │   └── Meeting Notes.md
    ├── 链接笔记/
    │   └── 2026-04-30_Article Highlights.md
    ├── 录音长录/
    │   ├── Recording Summary.md
    │   └── asset/
    │       ├── Recording Summary.mp3
    │       └── Recording Summary.md
    └── 其他/
        └── Unrecognized type.md
```

Each Markdown file is written with frontmatter; subsequent syncs use the `uid` field to recognize the same remote note.

```yaml
---
uid: "1908723638246504120"
title: "Meeting Notes"
created: 2026-04-30 12:45:24
modified: 2026-04-30 13:00:07
source: Dedao Brain
note_type: recorder_audio
tags: ["work"]
---
```

## Filename rules

| Case | Example |
| --- | --- |
| Has a title | `Meeting Notes.md` |
| No title | `This is the first paragraph.md` |
| With date prefix | `2026-04-30_Meeting Notes.md` |
| Same name, different notes | `Meeting Notes-2.md` |

Illegal characters (`\ / : * ? " < > |`) are stripped automatically.

## Filename prefix

You can prepend a date/time pattern to every filename. Available placeholders:

| Placeholder | Meaning | Example |
| --- | --- | --- |
| `YYYY` | 4-digit year | `2026` |
| `MM` | 2-digit month | `04` |
| `DD` | 2-digit day | `30` |
| `HH` | 2-digit hour (24h) | `14` |
| `mm` | 2-digit minute | `30` |
| `ss` | 2-digit second | `05` |

Examples:

| Prefix | Generated filename |
| --- | --- |
| `YYYY-MM-DD` | `2026-04-30_Meeting Notes.md` |
| `YYYYMMDD_HHmm` | `20260430_1430_Meeting Notes.md` |
| `YYYY-MM-DD` | `2026-04-30_.md` (uses body text when no title) |

The plugin substitutes placeholders with the note's `created_at` timestamp. Placeholders are case-sensitive: `mm` is minutes, `MM` is month.

## Settings

| Setting | Description | Default |
| --- | --- | --- |
| API Token | Dedao Brain Open Platform token | empty |
| Client ID | Dedao Brain Open Platform client ID | empty |
| Target folder | Sync target folder inside the vault | `得到大脑` |
| Filename prefix | Date/time prefix format, e.g. `YYYY-MM-DD` | empty |
| Auto sync range | Scheduled sync only pulls notes updated within the last N days; `0` means unlimited | `30` |
| Sync start date | Absolute start date for manual sync | empty |
| Scheduled sync | Background automatic sync toggle | off |
| Sync interval | Scheduled sync interval in minutes | `30` |
| Startup sync | Run a sync once when Obsidian starts | on |
| Note types to sync | Restrict which note types this sync method handles | all types |

## Sync model

The default download direction treats Dedao Brain as the source of truth:

1. Scan the target folder and build a `uid -> file` index from frontmatter.
2. Fetch the note list from the OpenAPI or Web API.
3. Filter by sync range and note type.
4. Create files for new notes.
5. Update files when `updated_at` changes.
6. Rename files when the displayed title changes.
7. Record every note's result in the sync history.
8. Scheduled sync saves the last-processed note's timestamp as the next checkpoint.

The upload direction is manual, selective, and create-only:

1. The user picks a local folder and Markdown files.
2. The plugin parses the title, body, and frontmatter.
3. Empty bodies, notes already confirmed to exist remotely, and unsupported types are skipped.
4. Eligible content is created as a new note in Dedao Brain.
5. Upload results are added to the sync history.

## Privacy

- The plugin does not depend on any extra backend service.
- API credentials are stored in your local Obsidian plugin data.
- On download, note data is fetched from Dedao Brain and written directly to your vault.
- On manual upload, only the Markdown files you selected are sent to Dedao Brain.
- Audio attachments are only downloaded from the HTTPS URLs returned by the API.

## Known limitations

- The plugin depends on the availability and response format of the Dedao Brain OpenAPI / Web API.
- OpenAPI requires a PRO membership; Temporary auth relies on a browser session and can expire.
- Audio downloads only work when the detail endpoint returns a valid HTTPS audio attachment.
- Download sync may update already-synced files. If you plan heavy manual editing, write personal additions in a separate note or via backlinks.
- Upload sync is currently create-only: it does not overwrite remote content, and it never runs automatically.

## Development

```bash
npm install
npm run typecheck
npm run lint
npm test
npm run build
```

Build artifacts are produced in the repository root:

- `main.js`
- `manifest.json`
- `styles.css`

The GitHub release workflow verifies typecheck, lint, tests, build, and tag / manifest version consistency before uploading artifacts.

## Support

- Bug reports: [GitHub Issues](https://github.com/AndyZhengyan/obsidian-dedao-brain-sync/issues)
- Feature requests: [GitHub Issues](https://github.com/AndyZhengyan/obsidian-dedao-brain-sync/issues/new/choose)
- User feedback survey: [Dedao-Brain-Sync 需求问题收集问卷](https://ku3yh6njf4.feishu.cn/share/base/form/shrcnShw4NxSTbVx7P7bjTxqvPe) — scan or click to share what you'd like next

  ![Feedback QR](docs/screenshots/feedback-qr.png)
- If this plugin helps you, a star is appreciated

## License

[MIT](LICENSE)
