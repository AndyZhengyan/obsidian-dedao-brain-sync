# Issue #237 Full Settings Link Layout Design

## Goal

Make the full-settings shortcut in the manual sync modal read as secondary navigation instead of part of the Cancel and Sync action sequence.

## Selected Layout

Use the footer's existing left-side utility position:

- Render `打开完整设置` / `Open full settings` as a text link without a directional arrow.
- Replace the `仅本次同步` / `This sync only` label with the link.
- Keep Cancel / Sync grouped on the right.
- Do not render a second settings-link row inside the modal body.
- Preserve the existing modal width, form layout, colors, button hierarchy, and spacing rhythm.

## Interaction

Clicking the link closes the manual sync modal and opens the Dedao Brain Sync1 settings tab. It does not trigger sync and does not preserve the modal's temporary filters.

## Accessibility

Implement the link as a semantic button styled like a text link because it performs an application action rather than navigating to a URL. Preserve keyboard focus behavior and a visible focus state.

## Scope

Only change the placement, copy, and presentation of the existing #237 settings shortcut. Do not change sync behavior, modal fields, vault writes, authentication, IDs, timestamps, versions, or other modals.

## Acceptance

- The full-settings link appears at the left side of the footer in place of the transient-scope label.
- The link contains no arrow that can visually point at Cancel.
- The footer contains the full-settings link and the Cancel / Sync buttons.
- No duplicate settings-link row appears above the footer.
- Clicking the link closes the modal, opens the plugin settings tab, and does not trigger sync.
- Chinese and English labels remain localized.
- Focused tests and the repository's required checks pass.
- The rebuilt plugin is deployed to the enabled local vault and visually accepted in Obsidian.
