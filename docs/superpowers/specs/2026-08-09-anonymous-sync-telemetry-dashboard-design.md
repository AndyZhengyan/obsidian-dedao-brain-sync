# Anonymous Sync Telemetry Dashboard Design

**Status:** Approved for planning

**Date:** 2026-08-09

**Scope:** Design only; this document does not authorize implementation or release

## 1. Purpose

Build a zero-cost private aggregation service that tells the plugin maintainer:

- how many notes were successfully synchronized each day;
- how many notes failed, were skipped, or were uploaded in the reverse direction;
- which sanitized error categories caused failures;
- whether failures correlate with a plugin version, sync mode, authentication mode, or coarse region;
- how many sync tasks completed successfully, partially succeeded, failed, or were cancelled.

The service must not collect note content, account data, vault information, persistent device identifiers, or precise location.

## 2. Product Decisions

The approved decisions are:

- The dashboard is private and accessible only to the maintainer.
- Anonymous telemetry is enabled only after explicit user consent.
- Declining telemetry never limits plugin functionality.
- Error messages are sanitized on the client and sanitized again on the server.
- Raw event and error records are retained for 30 days.
- Daily aggregate records are retained long term.
- Note counts and task health are separate metrics.
- Geographic reporting describes sync activity, not unique users.
- Chinese activity may be aggregated to province level; other activity is aggregated to country level.
- IP addresses are never written to application storage.
- Areas with fewer than five events in the selected reporting period are grouped as `Other` in the dashboard.

## 3. Metric Definitions

### 3.1 Note outcomes

For remote-to-local synchronization:

- `created`: a new local note was written.
- `updated`: an existing local note was changed.
- `success`: `created + updated`.
- `skipped`: a note was inspected but did not require a write, or was intentionally excluded by existing sync behavior.
- `failed`: a note-level operation failed.

Skipped notes are never counted as successful synchronization. This prevents scheduled scans of unchanged notes from inflating the main metric.

For local-to-remote synchronization, `created` is reported under the separate `local_to_remote` direction and is not mixed with remote-to-local success totals.

### 3.2 Task outcomes

- `success`: the task completed normally with zero failed notes.
- `partial`: the task completed but one or more notes failed.
- `failed`: the task terminated because of a task-level error.
- `cancelled`: the user cancelled the task. Cancellation is not a failure.

A successful task may contain zero successful notes when there was nothing new to write.

## 4. Architecture

Use one Cloudflare project for the aggregation service:

```text
Obsidian plugin
    |
    | POST /v1/events
    v
Cloudflare Worker
    |- schema validation
    |- edge rate limiting
    |- event-id deduplication
    |- server-side sanitization
    |- D1 writes
    v
Cloudflare D1
    |- 30-day task and error detail
    |- long-lived daily aggregates
    v
Cloudflare Pages private dashboard
    |- /dashboard
    |- /errors
    `- /regions

Cloudflare Cron Trigger
    |- daily reconciliation
    `- retention cleanup
```

The static dashboard and read APIs are protected by Cloudflare Access and restricted to the maintainer's email identity. The ingestion endpoint is public because an open-source plugin cannot safely contain a shared secret.

The telemetry service should live in an independent repository or deployment project. The plugin repository contains only the telemetry client, consent UI, tests, privacy documentation, and this design. Separating the projects prevents the Worker and dashboard toolchain from becoming part of the Obsidian plugin bundle.

## 5. Event Contract

Each completed sync task produces at most one telemetry event. Retries reuse the same `event_id`.

```json
{
  "schema_version": 1,
  "event_id": "5f80b650-2c8f-4f8e-bf58-960ee2531bbc",
  "plugin_version": "2.3.0",
  "direction": "remote_to_local",
  "mode": "time",
  "auth_mode": "openapi",
  "run_status": "partial",
  "counts": {
    "success": 15,
    "created": 12,
    "updated": 3,
    "skipped": 40,
    "failed": 2
  },
  "duration_bucket": "10s_30s",
  "errors": [
    {
      "code": "NETWORK_TIMEOUT",
      "stage": "fetch_note_detail",
      "count": 2,
      "message_preview": "Request timed out after <duration>"
    }
  ]
}
```

### 5.1 Allowed dimensions

- `direction`: `remote_to_local` or `local_to_remote`.
- `mode`: `time`, `selected`, `knowledge_base`, `auto`, or `local_upload`.
- `auth_mode`: `openapi` or `web`.
- `run_status`: `success`, `partial`, `failed`, or `cancelled`.
- `duration_bucket`: `under_1s`, `1s_3s`, `3s_10s`, `10s_30s`, `30s_2m`, `2m_10m`, or `over_10m`.

The client does not send an occurrence time or time zone. The Worker assigns `received_at` and the Beijing reporting date. The client does not send a permanent installation identifier.

### 5.2 Size and count limits

- Request body: at most 8 KiB.
- Error groups per task: at most 10.
- Sanitized message preview: at most 200 characters.
- All note counters: integers from 0 through 100,000.
- `success` must equal `created + updated`.
- Only known enum values and published plugin versions are accepted.

## 6. Error Taxonomy

Errors are grouped locally before upload. Initial error codes are:

- `NETWORK_TIMEOUT`
- `NETWORK_UNREACHABLE`
- `HTTP_ERROR`
- `AUTH_EXPIRED`
- `AUTH_INVALID`
- `QUOTA_EXCEEDED`
- `API_RESPONSE_INVALID`
- `NOTE_PARSE_FAILED`
- `VAULT_READ_FAILED`
- `VAULT_WRITE_FAILED`
- `ATTACHMENT_DOWNLOAD_FAILED`
- `UNKNOWN`

Initial stages are:

- `list_notes`
- `fetch_note_detail`
- `fetch_relationships`
- `download_attachment`
- `parse_note`
- `read_vault`
- `write_vault`
- `create_remote_note`
- `task_setup`
- `unknown`

The taxonomy is versioned with the event schema. New categories may be added without allowing arbitrary client-provided category names.

## 7. Privacy and Sanitization

### 7.1 Data that must never be uploaded

- note title, content, tags, note ID, detail ID, or knowledge-base ID;
- attachment names or URLs;
- vault name, folder name, file name, or file-system path;
- GetNote account identifiers;
- API tokens, client identifiers, CSRF values, cookies, or authorization headers;
- request or response bodies;
- operating-system name, device model, locale, or precise time zone;
- IP address, latitude, longitude, city, postal code, or metro code;
- a persistent installation or device identifier.

### 7.2 Client sanitization

The client first maps each error to an allow-listed error code and stage. It then removes or replaces:

- authorization and cookie values;
- URL query strings and fragments;
- email addresses;
- local and vault-like paths;
- long numeric identifiers;
- long random-looking alphanumeric strings;
- quoted note-like values and request payload fragments.

Known errors should use fixed templates rather than transformed raw text. Unknown errors may produce a sanitized `message_preview`, but the preview is optional and must be discarded when safe sanitization cannot be proven.

### 7.3 Server sanitization

The Worker repeats sanitization using stricter rules before any logging or database write. If the result still resembles a credential, identifier, email address, URL, path, or payload, the Worker stores an empty preview and retains only `code`, `stage`, and `count`.

The Worker must not log request bodies. Operational logs may contain route, status, latency, and generated request correlation IDs only.

## 8. Geographic Aggregation

Cloudflare derives coarse location from the network request:

- requests resolved to China use the province/region code;
- other requests use the two-letter country code;
- unknown or privacy-network locations use `Unknown`;
- city, coordinates, postal code, and time zone are ignored.

Location exists only during request processing. After the event has been accepted and deduplicated, the Worker increments `daily_regions` and discards the location. `event_records` and `event_errors` do not contain a location column.

Because the service has no persistent installation identifier, geographic data measures synchronization activity and note outcomes. It must never be labelled as users, installations, or people.

## 9. Storage Model

### 9.1 `event_records`

Task-level records retained for 30 days:

- `event_id` primary key
- `received_at`
- `beijing_date`
- `schema_version`
- `plugin_version`
- `direction`
- `mode`
- `auth_mode`
- `run_status`
- `created_count`
- `updated_count`
- `success_count`
- `skipped_count`
- `failed_count`
- `duration_bucket`

There is deliberately no region or installation column.

### 9.2 `event_errors`

Sanitized error groups retained for 30 days:

- `event_id`
- `error_code`
- `error_stage`
- `error_count`
- `message_preview`
- `message_fingerprint`

The fingerprint is computed after server sanitization and is used only to group equivalent previews.

### 9.3 Aggregate tables

`daily_stats` stores daily note and task totals by plugin version, direction, mode, and authentication mode.

`daily_errors` stores daily error totals by plugin version, error code, error stage, and sanitized fingerprint.

`daily_regions` stores daily task and note totals by coarse region code. Regions do not join back to individual events.

## 10. Ingestion, Deduplication, and Abuse Controls

The ingestion sequence is:

1. Reject unsupported methods, content types, body sizes, or schemas.
2. Validate enums, counts, internal count relationships, and plugin version.
3. Apply server sanitization.
4. Attempt to insert `event_records` by `event_id`.
5. If the ID already exists, return success without changing aggregates.
6. For a new event, write sanitized error groups and increment the region aggregate.
7. Return `202 Accepted` without exposing stored data.

No embedded plugin secret is used. Authenticity is therefore probabilistic, not cryptographic. The metrics are appropriate for product health and operational diagnosis, not billing or financial reporting.

Controls include:

- Cloudflare edge rate limiting without application-level IP storage;
- fixed request and field limits;
- published-version allow-listing;
- event ID uniqueness;
- rejection of inconsistent or extreme counters;
- anomaly flags for sudden volume, version, error, or region changes;
- separation of flagged traffic from trusted dashboard totals.

CORS, an obscure endpoint URL, or a key compiled into the plugin must not be described as security controls.

## 11. Client Reliability

Telemetry is always secondary to synchronization:

- local sync history is saved before telemetry is attempted;
- a telemetry request times out after three seconds;
- telemetry errors do not change sync status or display a sync failure notice;
- retryable events are stored in a local queue capped at 20 entries;
- queued events are retried on the next plugin start or completed sync;
- `400` responses discard the event;
- `429` and `5xx` responses keep the event for a later retry;
- retry attempts reuse the same event ID;
- disabling telemetry immediately clears the queue.

The queue stores only the already-sanitized payload. Raw errors are never queued.

## 12. Consent Experience

Telemetry is off until the user explicitly opts in. The consent prompt states:

> When enabled, the plugin sends created, updated, skipped, and failed note counts; plugin version; sync and authentication modes; and sanitized error categories. The service uses the network request to create country- or province-level aggregates but does not store IP addresses. It does not send note content, titles, tags, note IDs, file paths, vault information, account information, tokens, or cookies.

The prompt provides:

- `Enable anonymous statistics`
- `Not now`
- a link to the complete privacy documentation

The settings page shows the same summary, allows telemetry to be disabled at any time, and explains that disabling it clears queued reports. Rejection or later disabling has no effect on plugin functionality.

## 13. Dashboard

### 13.1 `/dashboard`

The overview shows:

- today's successful, failed, and skipped note counts;
- task success rate and counts of partial, failed, and cancelled tasks;
- comparisons with yesterday and the previous seven-day average;
- daily note-outcome trends;
- task-health distribution;
- top ten error groups;
- coarse activity-region distribution.

Filters are date range, plugin version, direction, mode, authentication mode, and coarse region where the underlying aggregate supports it. The UI must not imply that a cross-filter is available when the privacy-separated tables cannot answer it.

### 13.2 `/errors`

The error center shows error code, stage, occurrence count, affected task count, first and last appearance, plugin versions, authentication-mode distribution, seven-day trend, and sanitized preview samples. It marks error codes or fingerprints that first appeared after a plugin release.

### 13.3 `/regions`

The region page shows task count, successful note count, and failed note count for Chinese provinces and other countries. Regions with fewer than five events in the selected period are grouped into `Other`. The page is labelled as synchronization activity distribution, not user distribution.

The first version uses cards, line charts, stacked bars, and tables. It does not include a map, public page, multi-user account system, real-time streaming, or alert delivery.

## 14. Scheduled Maintenance

A daily Cron Trigger runs after the end of the Beijing reporting day. It:

1. reconciles the previous day's aggregate totals against retained event detail;
2. records discrepancies and anomaly flags;
3. finalizes daily error summaries;
4. deletes event and error detail older than 30 days in bounded batches;
5. leaves daily aggregate tables intact.

Cleanup is idempotent and safe to retry. A failed scheduled run must not delete data that has not been successfully summarized.

## 15. Failure Handling

- Invalid events return `400` with a generic error code and are not stored.
- Duplicate valid events return a successful response without another write.
- Rate-limited events return `429` and may be retried later.
- Temporary storage failures return `503`; no partial aggregate is committed.
- Dashboard read failures show the affected panel as unavailable without replacing previous data with zero.
- Missing geographic data is recorded only in the aggregate `Unknown` bucket.
- Unsupported future schema versions are rejected until the Worker supports them.

## 16. Verification and Acceptance

Implementation is accepted only when all of the following are demonstrated:

- No request to the telemetry origin occurs before consent.
- Declining or disabling telemetry does not affect plugin behavior.
- Disabling telemetry clears the local queue.
- Captured payloads contain none of the prohibited fields.
- Client sanitization tests cover tokens, cookies, emails, URLs, IDs, paths, quoted content, and generated secret-like strings.
- Server sanitization independently covers the same cases and drops unsafe previews.
- The Worker never logs event bodies.
- Repeated delivery of one event ID changes all metrics exactly once.
- Network timeout, offline mode, `429`, and `5xx` do not affect synchronization.
- OpenAPI and Web API syncs produce correctly separated aggregates.
- Remote-to-local and local-to-remote results never mix.
- Success, partial, failed, cancelled, skipped-only, and empty tasks use the defined semantics.
- Beijing date boundaries are correct around midnight and UTC date changes.
- Event detail has no region column and cannot be joined to region aggregates.
- Unauthorized users cannot access dashboard pages or read APIs.
- Records older than 30 days are deleted only after successful aggregation.
- Low-volume regions are grouped into `Other` in dashboard responses.

Before any plugin pull request is proposed as complete, the repository checks remain:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

## 17. Operator Prerequisites

No Cloudflare-specific MCP server is required. Deployment uses Wrangler and the Cloudflare dashboard.

Before the first deployment, the maintainer must:

1. own or create a Cloudflare account on the Free plan;
2. run `npx wrangler login` locally and complete the browser OAuth flow;
3. confirm that Wrangler can display the authenticated account;
4. later configure Cloudflare Access so only the maintainer's email can reach the production `*.pages.dev` dashboard.

No API token, Global API Key, password, OAuth callback, or credential value should be pasted into an issue, pull request, repository file, or assistant conversation. A custom domain is optional; the production `*.pages.dev` domain can be protected by Cloudflare Access. Resource creation, Access policy configuration, and production deployment remain separate implementation actions and require explicit authorization.

## 18. Delivery Phases

1. Create the independent Worker and D1 project, migrations, validation, sanitization, deduplication, and retention job.
2. Build the private Pages dashboard and Cloudflare Access policy.
3. Add plugin consent, client sanitization, event construction, bounded queue, and retry behavior.
4. Verify end to end in a non-production telemetry environment using both authentication modes and both sync directions.
5. Publish privacy documentation and release the opted-in telemetry client through the normal plugin pull-request and release workflow.
6. Observe the service for one to two weeks before considering alerts or a separate public aggregate page.

## 19. Explicit Non-Goals

- Counting unique users or installations
- Collecting precise geography
- Collecting note-level telemetry
- Remote debugging with raw logs
- Billing-grade or tamper-proof analytics
- Public rankings or public dashboards
- Modifying synchronization semantics
- Replacing the existing local sync history
