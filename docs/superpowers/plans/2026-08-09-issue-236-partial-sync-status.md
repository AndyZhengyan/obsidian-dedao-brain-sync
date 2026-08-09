# Issue #236 Partial Sync Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface completed syncs with per-note failures as `partial`, with durable history, 15-second manual warnings, a three-run scheduled warning threshold, and warning-oriented history rendering.

**Architecture:** Derive status from `SyncResult.failed` at each completed sync boundary while preserving explicit exception and cancellation statuses. Keep notification/counter logic in `GetNoteSyncPlugin`, and keep history presentation logic in the history modal. Reuse existing i18n, Notice helpers, settings persistence, and CSS variables.

**Tech Stack:** TypeScript, Obsidian API, Preact-compatible plugin runtime, Vitest, happy-dom, CSS.

## Global Constraints

- Preserve per-note fault tolerance: one failed note must not abort other notes.
- Manual partial notices last exactly `15000` ms.
- Scheduled partial warning triggers once when the consecutive count reaches exactly `3`, then waits for a clean-run reset.
- Partial scheduled sync may advance the checkpoint unless `checkpointBlocked` is true.
- Thrown sync failures remain `failed`; cancellations remain `cancelled`.
- Do not change API calls, vault writes, authentication, IDs/timestamps, versions, or release behavior.
- Required verification: `npm run typecheck`, `npm run lint`, `npx eslint tests --max-warnings=0`, `npm test`, and `npm run build`.
- Deployment keeps version `1.4.2` and preserves vault `data.json`.

---

### Task 1: Persist and record completed partial results

**Files:**
- Modify: `src/types.ts`
- Modify: `src/main.tsx`
- Modify: `tests/sync.spec.ts`

**Interfaces:**
- Consumes: `SyncResult.failed`, explicit `SyncHistoryEntry['status']`, and `SyncResult.checkpointBlocked`.
- Produces: `SyncHistoryEntry['status']` including `'partial'`; completed download, knowledge-base, scheduled, and upload records use `partial` when `failed > 0`.

- [ ] **Step 1: Write failing status tests**

Add focused tests in `tests/sync.spec.ts` that exercise real plugin methods:

```ts
it('records a completed manual sync with failed items as partial', async () => {
  vi.spyOn(SyncEngine.prototype, 'sync').mockResolvedValue({
    created: 1, updated: 0, skipped: 0, failed: 1, total: 2, items: [],
  });
  const plugin = makePlugin();
  await plugin['runSync']('full', { maxDays: 0, syncStartDate: '' });
  expect(plugin.syncHistory.at(-1)?.status).toBe('partial');
});
```

Add equivalent observable assertions for knowledge-base sync and resolved upload failures. Add a scheduled partial test that asserts `status === 'partial'` and the checkpoint advances when `checkpointBlocked` is false, plus a blocked-checkpoint test. Add an `onload` normalization test using persisted history with `status: 'partial'` and assert it remains partial.

- [ ] **Step 2: Run the focused tests and verify RED**

Run:

```bash
npm test -- tests/sync.spec.ts
```

Expected: partial assertions fail because resolved runs are recorded as success or failed, and the union/normalizer does not accept partial.

- [ ] **Step 3: Implement the minimal status model**

Extend the type:

```ts
status: 'success' | 'partial' | 'failed' | 'cancelled';
```

Preserve partial in `normalizeSyncHistory`. At completed-result boundaries derive:

```ts
const status: SyncHistoryEntry['status'] = result.failed > 0 ? 'partial' : 'success';
```

Pass it to `recordSyncHistory` for normal download, knowledge-base, and upload paths. Change checkpoint eligibility to:

```ts
if (type === 'auto' && (status === 'success' || status === 'partial') && !result.checkpointBlocked) {
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run `npm test -- tests/sync.spec.ts` and require zero failures.

---

### Task 2: Notify manual and scheduled partial failures

**Files:**
- Modify: `src/main.tsx`
- Modify: `src/i18n.ts`
- Modify: `tests/sync.spec.ts`

**Interfaces:**
- Consumes: completed status from Task 1, `autoSyncFailCount`, `showError`, `showSuccess`, and `issuedNotices` from the Obsidian test double.
- Produces: 15-second manual partial notices and a one-time scheduled threshold warning at count 3.

- [ ] **Step 1: Write failing notice and counter tests**

Import `issuedNotices` and `resetIssuedNotices` from `obsidian`. Add tests proving:

```ts
expect(issuedNotices.at(-1)).toEqual({
  message: '❌ [得到大脑] 同步部分完成：新增 1 · 更新 0 · 跳过 0 · 失败 1',
  timeout: 15000,
});
```

Run three scheduled partial results and assert the threshold warning appears only on the third. Run a fourth partial result and assert no duplicate threshold warning. Then run a clean result and assert the private counter returns to zero. Add equivalent 15-second partial notice coverage for knowledge-base and upload paths.

- [ ] **Step 2: Run the focused tests and verify RED**

Run `npm test -- tests/sync.spec.ts`.

Expected: current code emits success notices, resets the scheduled counter after every resolved run, and has no threshold-warning copy.

- [ ] **Step 3: Implement minimal notice behavior**

Add localized keys:

```ts
'notice.syncPartial': '同步部分完成：新增 {created} · 更新 {updated} · 跳过 {skipped} · 失败 {failed}',
'notice.autoSyncPartialThreshold': '连续 3 次自动同步存在失败，请打开同步日志查看详情。',
```

and equivalent English copy. For manual completed results, call `showError(..., 15000)` when `result.failed > 0`; otherwise retain the existing success notice. For scheduled results, increment the counter on partial, warn when it becomes `3`, and reset only after a clean result. Keep thrown-error notices unchanged.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run `npm test -- tests/sync.spec.ts` and require zero failures.

---

### Task 3: Render partial history as a warning

**Files:**
- Modify: `src/ui/sync-history-modal.tsx`
- Modify: `src/i18n.ts`
- Modify: `styles.css`
- Modify: `tests/sync-history.spec.ts`

**Interfaces:**
- Consumes: persisted `SyncHistoryEntry.status` including `partial`.
- Produces: localized partial label, warning class/icon, and default-expanded partial/failed details.

- [ ] **Step 1: Write failing history rendering tests**

Export `SyncHistoryModal` for direct component testing. Instantiate it with success, partial, and failed entries, call `onOpen()`, and assert:

```ts
expect(partialDetails.open).toBe(true);
expect(failedDetails.open).toBe(true);
expect(partialDetails.classList.contains('is-partial')).toBe(true);
expect(partialDetails.querySelector('.getnote-history-warning-icon')?.textContent).toBe('⚠');
expect(partialDetails.querySelector('.getnote-history-status-text')?.textContent).toBe('部分失败');
```

Also assert a non-newest success entry remains collapsed and has no warning icon.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npm test -- tests/sync-history.spec.ts
```

Expected: partial localization, warning classes/icon, and failure-driven expansion are absent.

- [ ] **Step 3: Implement minimal history rendering**

Add `syncHistory.status.partial` in Chinese and English. In `renderEntry`, add status classes, set `open` for the newest or warning/error statuses, and compose the summary from a decorative icon span plus a status text span. Add theme-variable CSS:

```css
.getnote-history-entry.is-partial { border-color: var(--text-warning); }
.getnote-history-warning-icon { color: var(--text-error); }
.getnote-history-status-text.is-partial { color: var(--text-warning); }
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run `npm test -- tests/sync-history.spec.ts` and require zero failures.

---

### Task 4: Verify, publish, and deploy

**Files:**
- Modify: `docs/superpowers/plans/2026-08-09-issue-236-partial-sync-status.md` only if execution checkboxes are updated.

**Interfaces:**
- Consumes: all implementation and test changes from Tasks 1-3.
- Produces: a green feature branch, PR targeting `main`, and hash-verified local-vault artifacts.

- [ ] **Step 1: Run full verification**

```bash
npm run typecheck
npm run lint
npx eslint tests --max-warnings=0
npm test
npm run build
git diff --check
```

- [ ] **Step 2: Commit and push**

```bash
git add src/types.ts src/main.tsx src/i18n.ts src/ui/sync-history-modal.tsx styles.css tests/sync.spec.ts tests/sync-history.spec.ts docs/superpowers/plans/2026-08-09-issue-236-partial-sync-status.md
git commit -m "feat(sync): surface partial sync failures (#236)"
git push -u origin codex/236-partial-sync-status
```

- [ ] **Step 3: Create the PR**

Create a ready PR targeting `main` with `Resolves #236`, the confirmed `15000` ms and threshold `3` decisions, TDD evidence, full gates, and the requirement for visible local Obsidian acceptance before merge.

- [ ] **Step 4: Deploy and verify artifacts**

Copy `main.js`, `manifest.json`, and `styles.css` to the enabled vault directory `.obsidian/plugins/getnote-importer/`. Verify SHA-256 equality for all three files and verify `data.json` is unchanged. Ask the user to reload Obsidian and accept both a partial notice and the sync-history warning presentation.
