# Anonymous Telemetry Plugin Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add explicit-consent, privacy-safe telemetry reporting to the Obsidian plugin after the Cloudflare telemetry service has a verified staging endpoint.

**Architecture:** A focused `src/telemetry/` module owns contracts, client-side sanitization, event construction, queueing, and delivery. The existing sync-history boundary remains the single integration point: local history is saved first, then an already-sanitized task summary is queued and sent without affecting synchronization. Consent UI and settings expose exactly what is collected and clear queued reports when disabled.

**Tech Stack:** TypeScript, Obsidian API, Preact, existing Vitest/happy-dom test stack, Obsidian `requestUrl` for desktop/mobile-compatible delivery.

## Global Constraints

- Do not start until the telemetry service plan has produced a verified staging ingestion URL and schema V1 contract.
- Telemetry is off until explicit consent; refusal or disabling never changes plugin behavior.
- Never send note content, titles, tags, note IDs, knowledge-base IDs, attachment data, vault/path data, account identifiers, credentials, request/response bodies, device data, locale, time zone, IP, or persistent installation ID.
- The queue stores only fully sanitized payloads and contains at most 20 events.
- Delivery times out after three seconds; failures never change sync status or show a sync failure notice.
- `success = created + updated`; skipped is separate; partial success is derived from a completed task with failed notes.
- OpenAPI, Web API, remote-to-local, and local-to-remote paths require focused coverage.
- Use Obsidian `requestUrl`; do not add axios or a browser-only fetch dependency.
- Do not change sync semantics, note writing behavior, or local sync-history retention.
- Do not bump `package.json` or `manifest.json` versions.
- All changes use a `codex/` branch and a PR targeting `main`; merge requires passing checks, real Obsidian UI acceptance, and explicit user approval.

---

### Task 1: Add Telemetry Settings and Safe Normalization

**Files:**
- Modify: `src/types.ts`
- Modify: `src/main.tsx`
- Test: `tests/telemetry-settings.spec.ts`

**Interfaces:**
- Produces: `TelemetryConsent`, `TelemetrySettings`, `PendingTelemetryEvent`, `DEFAULT_TELEMETRY_SETTINGS`, and `normalizeTelemetrySettings(value: unknown): TelemetrySettings`.
- Consumes: existing `Settings`, `DEFAULT_SETTINGS`, and `loadData()` normalization.

- [ ] **Step 1: Write failing settings tests**

Cover missing legacy data, explicit `granted`/`declined`, invalid consent reverting to `unknown`, removal of malformed queue entries, and truncation to the newest 20 sanitized events.

```ts
expect(normalizeTelemetrySettings(undefined)).toEqual({
  consent: 'unknown',
  pendingEvents: [],
});
```

- [ ] **Step 2: Run the settings test and confirm red**

Run: `npx vitest run tests/telemetry-settings.spec.ts`

Expected: FAIL because telemetry settings are undefined.

- [ ] **Step 3: Add settings types and defaults**

```ts
export type TelemetryConsent = 'unknown' | 'granted' | 'declined';

export interface TelemetrySettings {
  consent: TelemetryConsent;
  pendingEvents: PendingTelemetryEvent[];
}
```

Add `telemetry: TelemetrySettings` to `Settings` and normalize it independently when plugin data loads. Never infer consent from the presence of old data.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run tests/telemetry-settings.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/types.ts src/main.tsx tests/telemetry-settings.spec.ts
git commit -m "feat: persist anonymous telemetry consent"
```

---

### Task 2: Implement Error Classification and Client Sanitization

**Files:**
- Create: `src/telemetry/types.ts`
- Create: `src/telemetry/sanitize.ts`
- Test: `tests/telemetry-sanitize.spec.ts`

**Interfaces:**
- Produces: `classifySyncError(message: string, context: ErrorContext): TelemetryErrorGroup`, `sanitizeErrorPreview(message: string): string | undefined`, and fixed `TelemetryErrorCode`/`TelemetryErrorStage` unions matching service schema V1.
- Consumes: only strings already present in `SyncResultItem.error` or task-level `SyncHistoryEntry.error`; never consumes whole note objects.

- [ ] **Step 1: Write failing sanitizer tests**

Use the same privacy corpus as the service: Bearer tokens, cookies, CSRF values, emails, URLs, POSIX/Windows/vault paths, long IDs, long random strings, quoted content, request bodies, and safe timeout/network templates. Add 100 generated secret-like strings.

```ts
expect(sanitizeErrorPreview('/Users/alice/Vault/Private note.md')).toBeUndefined();
expect(classifySyncError('Request timed out', { stage: 'fetch_note_detail' }).code)
  .toBe('NETWORK_TIMEOUT');
```

- [ ] **Step 2: Run sanitizer tests and confirm red**

Run: `npx vitest run tests/telemetry-sanitize.spec.ts`

Expected: FAIL because the telemetry sanitizer does not exist.

- [ ] **Step 3: Implement allow-listed classification**

Map known API, auth, quota, parser, vault, and attachment failures to fixed codes/templates. Unknown errors receive a sanitized preview only when the final dangerous-pattern detector passes. Never include original input in thrown/logged sanitizer errors.

- [ ] **Step 4: Run focused tests and typecheck**

Run: `npx vitest run tests/telemetry-sanitize.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry tests/telemetry-sanitize.spec.ts
git commit -m "feat: sanitize telemetry errors on device"
```

---

### Task 3: Build Task-Level Events Without Note Metadata

**Files:**
- Create: `src/telemetry/event-builder.ts`
- Test: `tests/telemetry-event-builder.spec.ts`

**Interfaces:**
- Consumes: `SyncHistoryEntry`, current `AuthMode`, and plugin version string.
- Produces: `buildTelemetryEvent(entry, authMode, pluginVersion): PendingTelemetryEvent`.

- [ ] **Step 1: Write failing event-builder tests**

Cover successful, partial, failed, cancelled, skipped-only, empty, knowledge-base, automatic, selected, and upload histories. Include an entry containing titles, note IDs, selected IDs, tags, paths, and raw errors, then recursively assert none occur in serialized output.

```ts
expect(event.counts.success).toBe(entry.result.created + entry.result.updated);
expect(JSON.stringify(event)).not.toContain('private-note-id');
```

- [ ] **Step 2: Run builder tests and confirm red**

Run: `npx vitest run tests/telemetry-event-builder.spec.ts`

Expected: FAIL because the builder is missing.

- [ ] **Step 3: Implement explicit field projection**

Construct a new object field-by-field. Never spread `SyncHistoryEntry`, `SyncResult`, `scope`, or `items`. Group sanitized failures by `code + stage + preview`, cap groups at ten, and sum their counts. Use `crypto.randomUUID()` for `event_id`.

- [ ] **Step 4: Run builder and sanitizer tests**

Run: `npx vitest run tests/telemetry-event-builder.spec.ts tests/telemetry-sanitize.spec.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telemetry/event-builder.ts tests/telemetry-event-builder.spec.ts
git commit -m "feat: build privacy-safe sync summaries"
```

---

### Task 4: Implement the Bounded Queue and Non-Blocking Delivery

**Files:**
- Create: `src/telemetry/client.ts`
- Create: `src/telemetry/manager.ts`
- Test: `tests/telemetry-client.spec.ts`
- Test: `tests/telemetry-manager.spec.ts`

**Interfaces:**
- Consumes: service staging URL from the service plan, `TelemetrySettings`, `PendingTelemetryEvent`, Obsidian `requestUrl`, and a `saveSettings(): Promise<void>` callback.
- Produces: `sendTelemetryEvent(event, timeoutMs): Promise<'accepted' | 'discard' | 'retry'>` and `TelemetryManager.capture(entry, authMode): Promise<void>`, `flush(): Promise<void>`, `disable(): Promise<void>`.

- [ ] **Step 1: Write failing HTTP classification tests**

Test `202 => accepted`, `400/413/415 => discard`, `429/500/503/network/timeout => retry`, a three-second abort, JSON content type, and no credentials or referrer headers.

- [ ] **Step 2: Write failing queue tests**

Test consent gating, local persistence before sending, FIFO retry, stable event IDs, removal after acceptance/discard, retention after retry, maximum 20 entries, concurrent flush coalescing, and immediate queue clearing on disable.

- [ ] **Step 3: Run client/manager tests and confirm red**

Run: `npx vitest run tests/telemetry-client.spec.ts tests/telemetry-manager.spec.ts`

Expected: FAIL because client and manager are missing.

- [ ] **Step 4: Implement delivery with Obsidian `requestUrl`**

Use `Promise.race` around Obsidian `requestUrl` with a three-second timer, because `requestUrl` has no abort signal. Attach a rejection handler to the late request promise so it cannot become an unhandled rejection. A timeout returns `retry`; if the late request reached the server, the stable event ID makes the next attempt harmless. Serialize only `PendingTelemetryEvent.payload`, return a classification instead of throwing to sync callers, and never call Obsidian Notice APIs.

- [ ] **Step 5: Implement bounded queue persistence**

Persist the sanitized event before the first network attempt. Keep one in-flight `flushPromise` to avoid concurrent sends. On `disable()`, set consent to `declined`, clear the queue, and save once.

- [ ] **Step 6: Run focused tests and typecheck**

Run: `npx vitest run tests/telemetry-client.spec.ts tests/telemetry-manager.spec.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/telemetry tests/telemetry-client.spec.ts tests/telemetry-manager.spec.ts
git commit -m "feat: queue anonymous telemetry safely"
```

---

### Task 5: Add Explicit Consent and Settings Controls

**Files:**
- Create: `src/ui/telemetry-consent-modal.tsx`
- Modify: `src/settings/index.tsx`
- Modify: `src/main.tsx`
- Modify: `src/i18n.ts`
- Modify: `styles.css`
- Test: `tests/telemetry-consent.spec.tsx`
- Test: `tests/settings.spec.tsx`

**Interfaces:**
- Consumes: `TelemetrySettings` and `TelemetryManager.disable()` from prior tasks.
- Produces: first-run `openTelemetryConsentModal()` and a settings toggle/summary.

- [ ] **Step 1: Write failing consent UI tests**

Test that `unknown` opens once after layout readiness, granted/declined do not reopen, `Enable anonymous statistics` stores `granted`, `Not now` stores `declined`, closing without a choice stores no consent, and no telemetry request occurs during the modal interaction.

- [ ] **Step 2: Write failing settings tests**

Test the exact disclosure, enable/disable behavior, privacy-documentation link, and queue clearing on disable.

- [ ] **Step 3: Run UI tests and confirm red**

Run: `npx vitest run tests/telemetry-consent.spec.tsx tests/settings.spec.tsx`

Expected: FAIL because consent controls are missing.

- [ ] **Step 4: Implement exact disclosure copy in Chinese and English**

State collected counts/version/modes/sanitized errors/coarse service-side geography and the full prohibited-data list. Include explicit buttons for enable and not now. Do not use a pre-checked toggle or implied consent.

- [ ] **Step 5: Connect first-run lifecycle and settings control**

Open only after `app.workspace.onLayoutReady`. Disabling invokes `TelemetryManager.disable()` and updates mounted settings state immediately.

- [ ] **Step 6: Run UI tests, typecheck, and lint**

Run: `npx vitest run tests/telemetry-consent.spec.tsx tests/settings.spec.tsx && npm run typecheck && npm run lint`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/telemetry-consent-modal.tsx src/settings/index.tsx src/main.tsx src/i18n.ts styles.css tests
git commit -m "feat: request anonymous telemetry consent"
```

---

### Task 6: Integrate Telemetry at the Saved Sync-History Boundary

**Files:**
- Modify: `src/main.tsx`
- Test: `tests/telemetry-integration.spec.ts`
- Modify: `tests/sync.spec.ts`

**Interfaces:**
- Consumes: `TelemetryManager.capture()` and every existing call to `recordSyncHistory`.
- Produces: one event per completed manual, automatic, selected, knowledge-base, upload, failed, or cancelled task after local history persistence.

- [ ] **Step 1: Write failing integration tests**

Assert local `saveData` completes before capture, every mode maps correctly, partial status is derived when `result.failed > 0`, upload uses `local_to_remote`, failures retain only sanitized classification, disabled consent causes no request, and telemetry exceptions do not alter notices or sync state.

- [ ] **Step 2: Run integration tests and confirm red**

Run: `npx vitest run tests/telemetry-integration.spec.ts tests/sync.spec.ts`

Expected: FAIL because history is not connected to telemetry.

- [ ] **Step 3: Return the saved entry from `recordSyncHistory`**

Change the method to `Promise<SyncHistoryEntry>`, keep `await this.saveSettings()` before returning, and do not change history contents or retention.

- [ ] **Step 4: Capture after persistence on every task path**

Pass only the returned entry, active auth mode, and manifest version to the manager. Start queue flush after plugin load only when consent is `granted`. All capture calls must be awaited inside a telemetry-owned safe boundary or explicitly `void`ed when lifecycle must remain non-blocking.

- [ ] **Step 5: Run integration and existing sync tests**

Run: `npx vitest run tests/telemetry-integration.spec.ts tests/sync.spec.ts`

Expected: PASS with unchanged existing sync assertions.

- [ ] **Step 6: Commit**

```bash
git add src/main.tsx tests/telemetry-integration.spec.ts tests/sync.spec.ts
git commit -m "feat: report completed sync health anonymously"
```

---

### Task 7: Publish Privacy Documentation and Verify the Complete Plugin

**Files:**
- Create: `docs/anonymous-telemetry.md`
- Create: `docs/anonymous-telemetry_zh.md`
- Modify: `README.md`
- Test: `tests/telemetry-privacy.spec.ts`

**Interfaces:**
- Consumes: the implemented payload contract and service retention policy.
- Produces: user-facing disclosure and full implementation evidence.

- [ ] **Step 1: Write a payload privacy regression test**

Build events from adversarial sync histories containing every prohibited field and recursively scan serialized payload/queue data. Fail on known secrets, IDs, titles, tags, paths, URLs, account fields, or keys outside schema V1.

- [ ] **Step 2: Write separate English and Chinese privacy documents**

Document opt-in behavior, exact fields, prohibited fields, coarse geographic aggregation, 30-day detail retention, long-lived aggregates, disabling/queue deletion, and maintainer contact. Keep English and Chinese in separate files.

- [ ] **Step 3: Run the full repository gate**

Run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npx eslint tests --max-warnings=0
```

Expected: all commands PASS.

- [ ] **Step 4: Deploy to the enabled local Obsidian vault**

Use the `obsidian-plugin-deploy` skill to resolve the enabled vault plugin directory by manifest ID, deploy `main.js`, `manifest.json`, and `styles.css`, and verify hashes. Do not treat matching hashes as UI acceptance.

- [ ] **Step 5: Obtain real Obsidian acceptance**

Ask the user to reload Obsidian and verify: first-run disclosure, enable/not-now behavior, settings toggle, queue clearing, successful sync, partial failure display, and no visible sync regression. Do not merge before confirmation.

- [ ] **Step 6: Push the feature branch and open a PR**

Use a new `codex/anonymous-telemetry-client` branch based on current `main`. Include the service endpoint/schema, privacy evidence, test results, and UI acceptance status in the PR. Do not include credentials or raw payloads containing user data.

- [ ] **Step 7: Wait for required checks and explicit merge approval**

Resolve review comments with focused tests. Merge only after all required checks pass and the user explicitly approves the merge.
