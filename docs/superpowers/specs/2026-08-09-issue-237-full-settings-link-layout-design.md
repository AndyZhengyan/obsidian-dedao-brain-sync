# Issue #237 Full Settings Link Layout Design

## Goal

Make the full-settings shortcut in the manual sync modal read as secondary navigation instead of part of the Cancel and Sync action sequence.

## Selected Layout

Use a dedicated utility row between the explanatory hint and the footer divider:

- Render `打开完整设置` / `Open full settings` as a text link without a directional arrow.
- Align the link to the left edge of the modal content.
- Keep the footer limited to `仅本次同步` on the left and Cancel / Sync on the right.
- Preserve the existing modal width, form layout, colors, button hierarchy, and spacing rhythm.

## Interaction

Clicking the link closes the manual sync modal and opens the Dedao Brain Sync settings tab. It does not trigger sync and does not preserve the modal's temporary filters.

## Accessibility

Implement the link as a semantic button styled like a text link because it performs an application action rather than navigating to a URL. Preserve keyboard focus behavior and a visible focus state.

## Scope

Only change the placement, copy, and presentation of the existing #237 settings shortcut. Do not change sync behavior, modal fields, vault writes, authentication, IDs, timestamps, versions, or other modals.

## Acceptance

- The full-settings link appears on its own row below the explanatory hint.
- The link contains no arrow that can visually point at Cancel.
- The footer contains only the transient-scope label and the Cancel / Sync buttons.
- Clicking the link closes the modal, opens the plugin settings tab, and does not trigger sync.
- Chinese and English labels remain localized.
- Focused tests and the repository's required checks pass.
- The rebuilt plugin is deployed to the enabled local vault and visually accepted in Obsidian.
