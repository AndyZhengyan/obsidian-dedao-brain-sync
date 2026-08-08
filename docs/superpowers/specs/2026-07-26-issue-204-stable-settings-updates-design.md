# Issue #204: Stable settings runtime updates

The settings tab mounts once per `display()` and unmounts once per `hide()`. Sync progress, quota, and other runtime changes update props/state without invoking the settings-tab lifecycle or rebuilding the settings tree.

Runtime updates must preserve the settings scroll position, disclosure state, unsaved input text, focused element and caret, and open floating-select menu. Progress updates must not call `scrollIntoView`. Visible progress and quota values still update immediately.

This is a lifecycle-preserving change only. It adds no new settings behavior, copy, keyboard behavior, or synchronization semantics.
