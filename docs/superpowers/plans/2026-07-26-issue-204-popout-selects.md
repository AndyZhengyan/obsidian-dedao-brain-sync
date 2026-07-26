# Issue #204 popout implementation plan

1. Add failing second-window tests for open/select, outside click, resize/scroll repositioning, same-window one-open coordination, and main-window isolation.
2. Resolve the owning document/window from the rendered root and register all listeners/events in that realm.
3. Run focused tests and the full repository gate.
4. Deploy to local Obsidian and verify Tag, note-type, and knowledge-base selects in the main window and an actual popout.
5. Push a focused PR to `main` and monitor CI.
