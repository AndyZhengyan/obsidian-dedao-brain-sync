# Vault Folder Autocomplete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add datalist-based autocomplete to the "目标文件夹" setting input, reading top-level vault directories for suggestions while preserving manual input.

**Architecture:** Inject a `getVaultFolders()` method from `main.tsx` into the settings tab, which passes the folder list as a prop to `SettingsComponent`. The component renders a `<datalist>` alongside the existing `<input>` for native browser autocomplete.

**Tech Stack:** Obsidian plugin API, Preact, TypeScript

---

## File Map

- **Create:** none
- **Modify:** `src/main.tsx` — add `getVaultFolders()` method
- **Modify:** `src/settings-tab.tsx` — pass `vaultFolders` prop
- **Modify:** `src/settings/index.tsx` — add `vaultFolders` prop + datalist markup

---

## Task 1: Add `getVaultFolders()` to main.tsx

**Files:**
- Modify: `src/main.tsx:11-154`

- [ ] **Step 1: Add the method to GetNoteSyncPlugin class**

Open `src/main.tsx` and find the `GetNoteSyncPlugin` class body (after `saveSettings` or before `startAutoSync`).

Add this method after `saveSettings()`:

```ts
getVaultFolders(): string[] {
  const folders = new Set<string>();
  for (const dir of this.app.vault.getAllFolders()) {
    const parts = dir.path.split('/');
    if (parts.length >= 1 && parts[0]) {
      folders.add(parts[0]);
    }
  }
  folders.delete(this.settings.folderName);
  return Array.from(folders).sort();
}
```

- [ ] **Step 2: Verify type correctness**

Run: `npm run typecheck`
Expected: no errors (uses only `this.app.vault.getAllFolders()` which returns `TFolder[]`)

- [ ] **Step 3: Commit**

```bash
git add src/main.tsx
git commit -m "feat: add getVaultFolders() method to read top-level vault directories

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pass `vaultFolders` from settings-tab.tsx

**Files:**
- Modify: `src/settings-tab.tsx:22-33`

- [ ] **Step 1: Add `vaultFolders` prop to SettingsComponent**

In the `display()` method, add `vaultFolders={this.plugin.getVaultFolders()}` to the `<SettingsComponent>` JSX:

```tsx
<SettingsComponent
  settings={this.plugin.settings}
  updateSetting={this.updateSetting}
  startSync={() => this.plugin.startSync()}
  isSyncing={this.plugin.isSyncing}
  openNotePicker={() => this.plugin.openNotePicker()}
  startAutoSync={() => this.plugin.startAutoSync()}
  stopAutoSync={() => this.plugin.stopAutoSync()}
  vaultFolders={this.plugin.getVaultFolders()}
/>
```

- [ ] **Step 2: Verify typecheck**

Run: `npm run typecheck`
Expected: Type error — `SettingsComponent` props don't include `vaultFolders` yet (expected, fixes in Task 3)

- [ ] **Step 3: Commit**

```bash
git add src/settings-tab.tsx
git commit -m "feat: pass vaultFolders from plugin to settings component

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Update SettingsComponent to accept and render `vaultFolders`

**Files:**
- Modify: `src/settings/index.tsx:6-14` (interface)
- Modify: `src/settings/index.tsx:16-24` (destructuring + prop)
- Modify: `src/settings/index.tsx:132-143` (datalist markup)

- [ ] **Step 1: Add `vaultFolders` to `SettingsComponentProps` interface**

After `stopAutoSync: () => void;`, add:

```ts
vaultFolders: string[];
```

- [ ] **Step 2: Destructure `vaultFolders` in component params**

Update the function signature:

```tsx
export function SettingsComponent({
  settings,
  updateSetting,
  startSync,
  isSyncing,
  openNotePicker,
  startAutoSync,
  stopAutoSync,
  vaultFolders,
}: SettingsComponentProps) {
```

- [ ] **Step 3: Replace the folder input with datalist version**

Find the SettingItem for "目标文件夹" (around line 132-143). Replace the `<input>` block with:

```tsx
<SettingItem
  name="目标文件夹"
  description="笔记同步到 vault 内的子目录名（默认：Get笔记）"
>
  <div className="getnote-folder-input-wrapper">
    <input
      type="text"
      className="getnote-input"
      placeholder="Get笔记"
      value={folderName}
      list="getnote-folder-list"
      onInput={(e) => handleFolderChange((e.target as HTMLInputElement).value)}
    />
    <datalist id="getnote-folder-list">
      {vaultFolders.map(name => (
        <option key={name} value={name} />
      ))}
    </datalist>
  </div>
</SettingItem>
```

- [ ] **Step 4: Verify typecheck and build**

Run: `npm run typecheck`
Expected: no errors

Run: `npm run build`
Expected: `main.js` generated without errors

- [ ] **Step 5: Commit**

```bash
git add src/settings/index.tsx
git commit -m "feat: add datalist autocomplete for folder name input

- Accept vaultFolders prop from settings tab
- Render <datalist> with vault top-level directories
- Preserve manual input for custom folder names

Co-Authored-By: Claude Sonnet 4.6 (1M context) <noreply@anthropic.com>"
```

---

## Verification

After all tasks complete:

1. Run `npm run typecheck && npm run build && npm run test` — all should pass
2. In Obsidian, open Settings → Get笔记 Importer → verify the folder input shows autocomplete suggestions when typing
3. Test: empty vault → input still works; populated vault → suggestions appear
