# Get笔记 Importer — Vault 文件夹自动补全

## 目标

将"目标文件夹"输入框升级为带自动联想的下拉输入：用户输入时可从当前 Obsidian vault 读取已有目录进行提示，同时保留手动输入自定义目录的能力。

## 方案选择

采用 **Datalist 方案**（方案 A）：

- 使用原生 `<datalist>` + `<input list>` 实现，无需额外依赖
- 与 Obsidian settings 简洁风格一致
- 支持用户选择已有目录，也支持输入自定义目录

## 变更范围

### 1. `src/main.tsx` — 新增目录读取方法

```ts
// GetNoteSyncPlugin 新增方法
getVaultFolders(): string[] {
  const folders = new Set<string>();
  for (const dir of this.app.vault.getAllFolders()) {
    // 提取顶层目录名（斜杠前的部分）
    const parts = dir.path.split('/');
    if (parts.length >= 1 && parts[0]) {
      folders.add(parts[0]);
    }
  }
  // 去掉用户当前设置的 folderName（避免和自己重复）
  folders.delete(this.settings.folderName);
  return Array.from(folders).sort();
}
```

### 2. `src/settings-tab.tsx` — 注入目录列表

在 `display()` 中新增 `vaultFolders` prop：

```tsx
<SettingsComponent
  // ...existing props
  vaultFolders={this.plugin.getVaultFolders()}
/>
```

### 3. `src/settings/index.tsx` — SettingsComponent 增加 prop

- 新增 `vaultFolders: string[]` prop
- `<input>` 增加 `list="getnote-folder-list"`
- 新增 `<datalist id="getnote-folder-list">` 渲染 `vaultFolders` 选项

文件夹 SettingItem 渲染结构：

```tsx
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
```

### 4. `src/settings/index.tsx` — SettingItem 接口扩展

`SettingItemProps` 的 `children` 类型已支持 `ComponentChildren`，无需修改。

## UI 效果

- 用户在文件夹 input 中输入任意字符，浏览器自动展示匹配的已有目录
- 用户点击一个选项 → 填入 input
- 用户也可以完全忽略建议，手动输入任意自定义目录名
- 输入非法字符（`\ / : * ? " < > |`）在 `handleFolderChange` 中已过滤，无需额外处理

## 数据流

```
main.tsx: getVaultFolders()
  → settings-tab.tsx: vaultFolders prop
    → SettingsComponent: vaultFolders prop
      → <input list="..."> + <datalist>
```

## 测试要点

- vault 中有目录时，datalist 显示正确
- vault 中无目录时，datalist 为空，用户可正常手动输入
- 切换 vault 时目录列表随之更新（每次打开 settings tab 时重新读取）
