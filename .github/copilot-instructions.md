# Repository Instructions

This repository contains `obsidian-getnote-importer`, a TypeScript Obsidian plugin that syncs GetNote notes into a local Obsidian vault.

## Project Shape

- `src/main.tsx` wires the plugin lifecycle, commands, settings, and sync history.
- `src/sync.ts` owns GetNote-to-vault sync behavior and must be treated as high risk.
- `src/api.ts`, `src/note-parser.ts`, and `src/types.ts` contain API parsing and shared contracts.
- `src/ui/` and `src/settings/` contain Obsidian modal and settings UI implemented with Preact-compatible React APIs.
- Tests live in `tests/` and adjacent `src/*.test.ts` files.

## Required Checks

Run these before proposing a pull request or claiming a fix is complete:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## Engineering Rules

- Keep changes small and scoped to the issue or review comment.
- Preserve existing Obsidian vault data. Do not overwrite user notes unless the existing sync contract explicitly allows it.
- Be careful with GetNote IDs and timestamps. Large numeric IDs may exceed JavaScript safe integer precision, so prefer string-preserving parsing and comparisons.
- Add or update focused tests for sync, parser, settings, modal, or i18n behavior changes.
- Do not bump `package.json` or `manifest.json` versions unless the task is explicitly about releasing.
- Release artifacts are `main.js`, `manifest.json`, and `styles.css`.

## PR Guidance

- Explain user-visible behavior changes in the PR body.
- Mention the exact verification commands that passed.
- For AI-generated PRs, keep the branch focused and avoid unrelated formatting churn.
