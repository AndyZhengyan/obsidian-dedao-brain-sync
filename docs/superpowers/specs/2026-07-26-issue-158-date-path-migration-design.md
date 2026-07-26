# Issue #158: Created-date path organization

## Goal

Add an opt-in created-date path layer while preserving the plugin's current category hierarchy:

- normal: `root/YYYY/MM/category/file.md`
- knowledge base: `root/YYYY/MM/知识库/name/file.md`

The created date is authoritative. Updating a historical note does not move it to an update-date path and never creates a second copy.

## Settings experience

- Place the date-path toggle beside the existing filename-prefix setting in the file-organization section.
- When enabled, reveal a format input with default `YYYY/MM`.
- Show token guidance for both filename-prefix and date-path inputs. Date tokens are `YYYY`, `MM`, and `DD`; separators are allowed.
- Enabling, disabling, and applying a changed format each show a confirmation that describes the immediate local migration.
- Cancel changes neither settings nor files. Confirm first persists the desired
  layout, then runs one serialized local-only migration. If saving fails no
  files move; if migration is interrupted, the persisted target lets the
  idempotent reconcile action resume safely.

## Migration contract

Migration scans local plugin-owned notes and never fetches remote data or changes sync checkpoints.

For every note it computes one desired path from `created`, current category, and knowledge-base name. It resolves only assets actually referenced by that note under its adjacent `asset/` directory. Planning and conflict checks finish before a note is moved.

Each note is an atomic unit:

- move Markdown and its exact referenced assets together;
- never overwrite, duplicate, or manufacture suffixed names;
- if any source metadata, referenced asset, or target is unsafe, leave the entire note untouched and report it;
- if a rename fails, compensate in reverse order;
- if current and desired paths match, no-op;
- repeated runs and interrupted/resumed runs are safe;
- do not delete empty directories.

## Sync contract

New notes use the configured canonical date path. Existing UID matches remain where they are and keep the existing overwrite/skip contract; remote sync never performs migration. Created timestamps and string IDs retain their current precision and parsing.

## Documentation and verification

Update Chinese and English README sections with settings, tokens, examples, enable/disable/format-change behavior, local-only migration, asset handling, idempotency, and conflict behavior.

Verify with focused tests, the full gate, local deployment, and a real Obsidian flow covering enable, format change, disable/rollback, conflicts, repeated execution, and referenced assets.
