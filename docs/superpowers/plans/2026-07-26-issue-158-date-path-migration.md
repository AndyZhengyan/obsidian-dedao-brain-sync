# Issue #158 implementation plan

1. Add failing pure-path tests for validation, date tokens, normal and knowledge-base canonical paths, invalid timestamps, and traversal/reserved segments.
2. Implement `date-paths` pure helpers and route creation of new normal/knowledge-base notes and assets through them without moving existing UID matches.
3. Add failing migration tests for enable, disable, format change, exact referenced assets, conflicts, missing metadata, compensation, partial progress, and idempotency.
4. Implement a local-only scan/plan/preflight/execute migration service with per-note atomicity and structured results.
5. Add settings/UI tests, then implement the toggle, draft format input, token hints, confirmation flow, serialized execution, and visible result reporting.
6. Update i18n and both READMEs.
7. Run targeted tests, `npm run typecheck`, `npm run lint`, `npm test`, and `npm run build`.
8. Deploy build artifacts without changing repository versions, reload real Obsidian, exercise the full UI/vault flow, and capture visual evidence.
9. Review data-safety and UX, push a `codex/` branch, create a PR to `main`, and monitor CI. Keep it ready-for-review because it changes vault layout.
