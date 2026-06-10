# Complete Knowledge-Base Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish and ship the existing manual knowledge-base sync flow so users can choose a knowledge base and specific articles, then sync exactly those articles through either supported API mode.

**Architecture:** Keep knowledge-base sync as a separate manual workflow. The picker returns selected note IDs plus the smallest available API scope; the sync engine forwards that scope to the OpenAPI or Web API client, and explicit article selections bypass generic date and note-type filters.

**Tech Stack:** TypeScript, Preact-compatible React APIs, Vitest, Obsidian plugin APIs

---

### Task 1: Restore the manual settings entry

**Files:**
- Modify: `src/settings/index.tsx`
- Modify: `src/settings-tab.tsx`
- Test: `tests/settings.spec.ts`

- [x] Replace the release-only absence assertion with a test that renders the `按知识库同步` button and verifies its click handler.
- [x] Run `npm test -- tests/settings.spec.ts --run` and confirm the new test fails.
- [x] Add `startSubscribedKnowledgeSync` to the settings component props, render the button in the manual download actions, and wire it from the settings tab.
- [x] Run `npm test -- tests/settings.spec.ts --run` and confirm it passes.

### Task 2: Complete exact-selection behavior for both API modes

**Files:**
- Modify: `src/api-clients/openapi-client.ts`
- Modify: `src/api-clients/webapi-client.ts`
- Modify: `src/api.ts`
- Modify: `src/sync.ts`
- Modify: `tests/sync-engine.spec.ts`

- [x] Add a Web API regression proving a selected old knowledge-base article syncs despite generic date/type filters and stops after the selected article is found.
- [x] Recover the existing uncommitted scope-filtering implementation after verifying its focused tests.
- [x] Forward selected topic/note scope to both clients, stop fetching after all selected IDs are found, and bypass generic filters only for explicit article selections.
- [x] Run the focused OpenAPI and Web API sync tests and confirm they pass.

### Task 3: Verify picker scope and integration

**Files:**
- Modify: `src/ui/topic-picker-modal.tsx`
- Modify: `src/main.tsx`
- Modify: `tests/topic-picker-modal.spec.ts`

- [x] Verify picker tests cover returned note, topic, and OpenAPI blogger IDs, including fallback to the active topic.
- [x] Run `npm test -- tests/topic-picker-modal.spec.ts --run`.
- [x] Resolve any integration or type errors without expanding the feature into scheduled sync.

### Task 4: Validate and integrate

**Files:**
- Verify all changed files

- [x] Run `npm run typecheck`.
- [x] Run `npm run lint`.
- [x] Run `npm test`.
- [x] Run `npm run build`.
- [ ] Commit the completed feature, push `codex/complete-knowledge-base-sync`, create a PR targeting `main`, wait for required checks, and merge after they pass.
