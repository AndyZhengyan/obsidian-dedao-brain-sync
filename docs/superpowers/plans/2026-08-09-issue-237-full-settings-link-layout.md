# Issue #237 Full Settings Link Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the full-settings shortcut out of the Cancel / Sync action group and into its own utility row below the manual-sync hint.

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
- Produces: `.getnote-settings-link-row` as the final row in `.getnote-manual-sync-body`, immediately after the hint and before the footer, containing `.getnote-settings-link` with localized text and the existing click callback.

- [ ] **Step 1: Write the failing layout test**

Update the existing #237 component test to assert the navigation link is outside the footer action group, contains no arrow, and sits in its own row immediately before the footer:

```ts
const settingsLink = container.querySelector('.getnote-settings-link') as HTMLButtonElement;
const settingsRow = settingsLink.parentElement;
const body = container.querySelector('.getnote-manual-sync-body')!;
const footer = container.querySelector('.getnote-picker-footer')!;

expect(settingsLink.textContent).toBe('Open full settings');
expect(settingsRow?.classList.contains('getnote-settings-link-row')).toBe(true);
expect(settingsRow?.parentElement).toBe(body);
expect(settingsRow?.previousElementSibling?.classList.contains('getnote-input-hint')).toBe(true);
expect(body.nextElementSibling).toBe(footer);
expect(footer.contains(settingsLink)).toBe(false);
```

- [ ] **Step 2: Run the focused test and verify the current inline layout fails**

Run:

```bash
npm test -- tests/manual-sync-modal.spec.ts
```

Expected: FAIL because the current link is inside `.getnote-picker-btns` and its label includes `→`.

- [ ] **Step 3: Implement the dedicated utility row**

In `src/ui/manual-sync-modal.tsx`, move the existing conditional button into the end of `.getnote-manual-sync-body`, immediately after the hint:

```tsx
{onOpenSettings && (
  <div className="getnote-settings-link-row">
    <button
      className="getnote-settings-link"
      type="button"
      onClick={onOpenSettings}
    >
      {t('manualSync.openSettings')}
    </button>
  </div>
)}
```

Keep `.getnote-picker-btns` limited to Cancel and Sync. Change the localized values to `打开完整设置` and `Open full settings`. Add focused CSS for left alignment, spacing above the footer, link hover, and `:focus-visible` without changing the modal width or button styling.

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
