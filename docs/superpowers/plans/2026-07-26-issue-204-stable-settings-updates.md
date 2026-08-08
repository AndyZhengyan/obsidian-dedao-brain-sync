# Issue #204 stable settings implementation plan

1. Add failing tests that mount the settings tab once, mutate DOM-local state, send repeated runtime updates, and assert node identity, input value, focus/caret, disclosures, scroll, and floating-select state are preserved while progress/quota content changes.
2. Introduce a small mounted settings host/controller with a runtime update method; `display()` mounts and `hide()` unmounts.
3. Replace lifecycle refresh calls with runtime updates and remove progress-driven `scrollIntoView`.
4. Run focused tests and the full repository gate.
5. Deploy to local Obsidian and verify settings during a real progress sequence before opening a focused PR.
