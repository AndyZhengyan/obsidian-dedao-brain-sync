# Issue #237 Full Settings Link Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the full-settings shortcut in the footer's left-side utility position, replacing the transient-scope label.

**Architecture:** Keep the existing `onOpenSettings` callback and runtime settings navigation unchanged. Adjust only the `ManualSyncModal` DOM hierarchy, localized label, and focused CSS so navigation and sync actions are visually separate.

**Tech Stack:** TypeScript, Preact, CSS, Vitest, happy-dom, Obsidian API.

## Global Constraints

- Only change issue #237 shortcut placement, copy, presentation, and its focused tests.
- Do not change sync behavior, modal fields, vault writes, authentication, IDs, timestamps, versions, or other modals.
- Keep the link keyboard accessible as a semantic button with a visible focus state.
- Required verification: `npm run typecheck`, `npm run lint`, `npx eslint tests --max-warnings=0`, `npm test`, and `npm run build`.
- Deploy `main.js`, `manifest.json`, and `styles.css` to the enabled local `getnote-importer` vault directory without changing version `1.4.2`.

---

### Task 1: Separate the settings shortcut from sync actions

**Files:**
- Modify: `tests/manual-sync-modal.spec.ts`
- Modify: `src/ui/manual-sync-modal.tsx`
- Modify: `src/i18n.ts`
- Modify: `styles.css`

**Interfaces:**
- Consumes: existing optional `onOpenSettings?: () => void` prop.
- Produces: `.getnote-settings-link` as the direct left-side child of `.getnote-picker-footer`, with localized text and the existing click callback; removes the old `.getnote-settings-link-row`. When the optional callback is absent, the existing `.getnote-picker-count` remains as a compatibility fallback.

- [ ] **Step 1: Write the failing layout test**

Update the existing #237 component test to assert the navigation link contains no arrow, replaces the old scope label, and is a direct child of the footer:

```ts
const settingsLink = container.querySelector('.getnote-settings-link') as HTMLButtonElement;
const footer = container.querySelector('.getnote-picker-footer')!;

expect(settingsLink.textContent).toBe('Open full settings');
expect(settingsLink.parentElement).toBe(footer);
expect(container.querySelector('.getnote-settings-link-row')).toBeNull();
expect(container.querySelector('.getnote-picker-count')).toBeNull();
```

- [ ] **Step 2: Run the focused test and verify the current inline layout fails**

Run:

```bash
npm test -- tests/manual-sync-modal.spec.ts
```

Expected: FAIL because the current link is in a dedicated body row and the footer still renders `.getnote-picker-count`.

- [ ] **Step 3: Implement the footer utility link**

In `src/ui/manual-sync-modal.tsx`, remove the dedicated body row and replace the footer scope label with the conditional settings button:

```tsx
{onOpenSettings ? (
  <button
    className="getnote-settings-link"
    type="button"
    onClick={onOpenSettings}
  >
    {t('manualSync.openSettings')}
  </button>
) : (
  <span className="getnote-picker-count">{t('manualSync.once')}</span>
)}
```

Keep `.getnote-picker-btns` limited to Cancel and Sync. Preserve the localized values `打开完整设置` and `Open full settings`. Remove the obsolete row CSS and preserve the count fallback CSS, link hover, and `:focus-visible` behavior without changing the modal width or button styling.

- [ ] **Step 4: Run focused and full verification**

Run:

```bash
npm test -- tests/manual-sync-modal.spec.ts
npm run typecheck
npm run lint
npx eslint tests --max-warnings=0
npm test
npm run build
```

Expected: focused test passes; full suite, lint, typecheck, and build exit successfully.

- [ ] **Step 5: Commit, push, deploy, and verify artifacts**

```bash
git add src/i18n.ts src/ui/manual-sync-modal.tsx styles.css tests/manual-sync-modal.spec.ts docs/superpowers/plans/2026-08-09-issue-237-full-settings-link-layout.md
git commit -m "fix(ui): separate #237 settings link from sync actions"
git push origin codex/237-add-settings-entry-in-manual-sync-modal
```

Copy the rebuilt release artifacts to `/Users/zhengyan/Downloads/同步空间/9_个人笔记/郑大师的笔记本/.obsidian/plugins/getnote-importer/`, verify source and deployed SHA-256 hashes match, then request visible Obsidian acceptance after `Reload app without saving`.
