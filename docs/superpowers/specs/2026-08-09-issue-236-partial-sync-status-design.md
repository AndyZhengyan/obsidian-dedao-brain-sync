# Issue #236 Partial Sync Status Design

## Goal

Make per-note failures immediately visible without changing the existing fault-tolerant sync contract: one failed note must not stop other notes from syncing.

## Status Model

Extend `SyncHistoryEntry.status` with `partial`.

- `success`: the sync operation completed and `result.failed === 0`.
- `partial`: the sync operation completed and `result.failed > 0`.
- `failed`: the sync operation itself threw or could not complete.
- `cancelled`: the user cancelled the operation.

Apply the same result-derived `partial` status to time sync, selected-note sync, knowledge-base sync, scheduled sync, and local upload. Preserve explicit `failed` and `cancelled` statuses passed by exception and cancellation paths.

Persisted `partial` entries must survive settings normalization instead of being downgraded to `success`.

## Checkpoint and Failure-Counter Semantics

Scheduled sync keeps its current checkpoint behavior. Both `success` and `partial` may advance `lastSyncEndTimestamp` when `checkpointBlocked` is false. A retryable knowledge-base failure with `checkpointBlocked: true` keeps the existing checkpoint.

`autoSyncFailCount` tracks consecutive scheduled runs that contain either a partial result or a thrown failure:

- A scheduled result with `failed > 0` increments the counter.
- A scheduled result with `failed === 0` resets the counter to zero.
- When a resolved partial result makes the counter reach exactly 3, show one warning directing the user to the sync log.
- Do not show the threshold warning again for counts above 3; a later clean run resets the sequence.
- Thrown scheduled-sync failures keep their existing immediate error notices and counter increment behavior.

## Notices

Manual time, selected-note, knowledge-base, and upload syncs use the error notice channel for `partial` results. The notice:

- stays visible for 15,000 ms;
- includes created, updated where applicable, skipped, and failed counts;
- does not change the underlying completed-result semantics.

Clean results continue to use the existing success notices and timeouts. Scheduled partial results do not show a notice until the third consecutive failed run, preventing noise from a single intermittent note failure.

Add localized Chinese and English copy for the partial status, the manual partial-result notice, and the scheduled threshold warning.

## Sync History UI

The history modal renders `partial` with warning styling distinct from red `failed` and green `success`.

- `partial` and `failed` entries are expanded by default.
- The newest entry remains expanded by default even when successful.
- A partial or failed summary begins with a visible warning icon plus the localized status text.
- The warning icon is decorative; status text remains the accessible source of meaning.
- Per-note failure details and aggregate-error suppression continue to work as today.

## Scope

Do not change note selection, API calls, per-note error recovery, vault writes, authentication, GetNote IDs or timestamps, version numbers, release behavior, or the maximum history size. Do not convert thrown failures into `partial`.

## Acceptance

- A completed sync with at least one failed item is recorded as `partial` for download, knowledge-base, scheduled, and upload paths.
- A completed sync with no failed items remains `success`; thrown and cancelled operations retain their existing statuses.
- Manual partial notices use the error channel, include failure counts, and remain for 15 seconds.
- Scheduled partial results warn once when the consecutive counter reaches 3 and reset after a clean run.
- Partial scheduled results preserve checkpoint advancement unless `checkpointBlocked` is true.
- Persisted partial history entries normalize back to `partial`.
- History renders localized warning status, warning styling, an icon with status text, and default-expanded partial/failed details.
- Focused tests demonstrate each new behavior by failing before implementation and passing afterward.
- `npm run typecheck`, `npm run lint`, `npx eslint tests --max-warnings=0`, `npm test`, and `npm run build` pass.
- The built plugin is deployed to the enabled local vault without changing version `1.4.2`, and the user visibly accepts the notice and history presentation before merge.
