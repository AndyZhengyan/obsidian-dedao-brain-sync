# Issue #204: Floating selects in Obsidian popouts

Floating Tag, note-type, and knowledge-base selects must behave identically in the main window and an actual Obsidian popout. Every listener and coordination event belongs to the trigger element's `ownerDocument` and `defaultView`, with `activeDocument` only as a fallback.

Opening, positioning, scroll/resize repositioning, outside-click closing, and one-open-select coordination remain unchanged within each window. Events in the main window must not be required to operate or close a select in a popout. This change adds no new keyboard or accessibility behavior.
