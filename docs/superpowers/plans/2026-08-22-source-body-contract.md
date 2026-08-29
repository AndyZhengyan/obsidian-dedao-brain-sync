# Source Body Contract Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve remote source Markdown inside a safe, portable boundary while keeping generated local content and reverse-create uploads separate.

**Architecture:** Add a small platform-neutral source-body module for LF canonicalisation, marker rendering/parsing, and SHA-256 fingerprints. `note-parser` composes that block with frontmatter and derived blocks; reverse sync selects it before upload; sync writing treats any non-matching same-name file as a conflict instead of an update.

**Tech Stack:** TypeScript, Vitest, Obsidian vault APIs, no new runtime dependency.

**Spec:** `docs/superpowers/specs/2026-08-22-source-body-contract-design.md`

## Global Constraints

- Support desktop and mobile; do not import Node-only crypto.
- Do not modify existing UID-matched notes or bulk-migrate old files.
- Never fall back to full-body upload after detecting malformed markers.
- Preserve source text exactly except CRLF-to-LF normalisation.
- Never overwrite a same-name vault file without the incoming UID.

---

### Task 1: Source-body protocol module

**Files:**
- Create: `src/source-body.ts`
- Test: `src/source-body.test.ts`

**Interfaces:**
- Produces `normalizeSourceBody(value: string): string`.
- Produces `renderSourceBody(value: string): string`.
- Produces `parseSourceBody(value: string): { kind: 'absent' } | { kind: 'valid'; body: string } | { kind: 'invalid'; reason: string }`.
- Produces `createSourceHash(title: string, tags: string[], body: string): string`.

- [ ] Write failing tests for a valid body with leading/trailing blank lines, absent markers, duplicate/reversed markers, marker collision, and SHA-256 known output.
- [ ] Run `npx vitest run src/source-body.test.ts` and confirm the missing-module failure.
- [ ] Implement marker constants, LF canonicalisation, fixed-frame rendering, strict line-based parsing, sorted de-duplicated tags, and a pure TypeScript SHA-256 helper.
- [ ] Run `npx vitest run src/source-body.test.ts` and confirm all protocol tests pass.
- [ ] Commit `feat: add source body protocol`.

### Task 2: Render source boundaries and validate templates

**Files:**
- Modify: `src/note-parser.ts`
- Modify: `src/note-parser.test.ts`

**Interfaces:**
- Consumes `renderSourceBody` and `createSourceHash` from Task 1.
- `renderNote` and `renderNoteWithTemplate` emit `dedao_sync_schema` and `dedao_source_hash`.

- [ ] Write failing tests proving default notes, audio notes, and template notes contain exactly one source-body block; assert derived blocks remain outside it.
- [ ] Add failing tests for zero, one, and duplicate `{{content}}` placeholders and a frontmatter placeholder.
- [ ] Run `npx vitest run src/note-parser.test.ts` and confirm assertions fail against current output.
- [ ] Refactor body construction into source and derived sections; inject the rendered block once; regenerate the plugin-owned fields; return a clear render error for invalid templates or marker collisions.
- [ ] Run `npx vitest run src/note-parser.test.ts` and confirm all tests pass.
- [ ] Commit `feat: render source body boundaries`.

### Task 3: Select marked content for reverse creation

**Files:**
- Modify: `src/reverse-sync.ts`
- Modify: `tests/reverse-sync-engine.spec.ts`

**Interfaces:**
- Consumes `parseSourceBody` from Task 1.
- `LocalMarkdownNote.body` is either the valid marked source body or the legacy full body.

- [ ] Write failing tests that a marked local file uploads only marked text, while unmarked files still upload their full body.
- [ ] Add failing malformed-marker tests that assert no save request is sent and the result is skipped with an error.
- [ ] Run `npx vitest run tests/reverse-sync-engine.spec.ts` and confirm failures are due to whole-body selection.
- [ ] Select and validate the marker body during local-file reading, before image-to-link conversion and remote existence checks.
- [ ] Run `npx vitest run tests/reverse-sync-engine.spec.ts` and confirm all tests pass.
- [ ] Commit `feat: use source body for reverse creation`.

### Task 4: Protect same-name local files and add fidelity fixtures

**Files:**
- Modify: `src/sync.ts`
- Modify: `tests/sync-engine.spec.ts`
- Modify: `src/note-parser.test.ts`

**Interfaces:**
- A non-matching same-name `TFile` is routed through `resolveConflict`; it is never passed to `vault.modify`.

- [ ] Write failing sync-engine tests for a same-name user file without UID and for a create-race file without matching UID.
- [ ] Add fixture-style source-body cases for nested lists, tables, task lists, code fences, math, Unicode, links, images, and CRLF/blank-line preservation.
- [ ] Run the focused tests and confirm the overwrite assertion fails on current behaviour.
- [ ] Route both normal collision and create-race paths to a conflict-suffixed create; keep matching UID behaviour unchanged.
- [ ] Run focused parser and sync tests and confirm all pass.
- [ ] Commit `fix: preserve same-name vault files during sync`.

### Task 5: Full verification and PR handoff

**Files:**
- Modify: `docs/superpowers/specs/2026-08-22-source-body-contract-design.md` only if implementation exposes a necessary specification correction.

- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint` and `npx eslint tests --max-warnings=0`.
- [ ] Run `npm test`.
- [ ] Run `npm run build`.
- [ ] Inspect `git diff origin/main...HEAD --check` and review the complete diff against the acceptance criteria.
- [ ] Push `codex/source-body-contract`, create a PR targeting `main`, and report its URL.
