# Anonymous Telemetry Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build and deploy a free, private Cloudflare telemetry service that accepts privacy-safe sync summaries, aggregates daily health and coarse-region metrics, and exposes a maintainer-only dashboard.

**Architecture:** Create a separate private repository at `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry`. A public Worker accepts events and runs reconciliation/retention against D1; a Pages application serves the private Preact dashboard and D1-backed read APIs behind Cloudflare Access. The Worker and Pages Functions share only a small contracts package and use generated binding types.

**Tech Stack:** TypeScript, Cloudflare Workers, Pages Functions, D1, Wrangler 4.x, Preact, Vite, Zod, Vitest, `@cloudflare/vitest-pool-workers`.

## Global Constraints

- Use Cloudflare Free-plan resources only.
- Use `wrangler.jsonc` with `compatibility_date: "2026-08-10"`, `nodejs_compat`, generated binding types, and structured observability.
- Use a new private GitHub repository named `dedao-brain-sync-telemetry`; never add service code to the Obsidian plugin bundle.
- The ingestion endpoint is public; dashboard pages and read APIs are private through Cloudflare Access.
- Never store or log request bodies, IP addresses, note data, vault data, account identifiers, credentials, precise location, or persistent installation identifiers.
- Raw task/error rows live for 30 days; aggregate rows live long term.
- Geographic metrics describe sync activity, not users; China is grouped by province and other activity by country.
- All D1 access uses prepared statements through bindings, not Cloudflare REST calls from runtime code.
- Every Promise is awaited, returned, or passed to `ctx.waitUntil()`; no mutable request state at module scope.
- No production deploy, D1 creation, Access policy, or GitHub repository creation occurs until the user approves the execution plan.

---

### Task 1: Scaffold the Independent Service and Shared Contract

**Files:**
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/package.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/tsconfig.base.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/eslint.config.mjs`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/.gitignore`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/package.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/tsconfig.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/vitest.config.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/packages/contracts/package.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/packages/contracts/src/index.ts`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/packages/contracts/src/index.test.ts`

**Interfaces:**
- Produces: `TelemetryEventV1`, `TelemetryErrorGroup`, `telemetryEventSchema`, enum constants, and `parseTelemetryEvent(input: unknown): TelemetryEventV1`.
- Consumes: No prior implementation task.

- [ ] **Step 1: Create the private repository locally and initialize the workspace**

Create the directory with `mkdir`, initialize Git with default branch `main`, and add npm workspaces for `packages/*` and `apps/*`. Define root scripts `test`, `typecheck`, `lint`, and `build`. Pin and lock these versions resolved on 2026-08-10:

```json
{
  "devDependencies": {
    "@cloudflare/vitest-pool-workers": "0.20.3",
    "@cloudflare/workers-types": "5.20260810.1",
    "@preact/preset-vite": "2.10.6",
    "@testing-library/preact": "3.2.4",
    "eslint": "10.8.1",
    "happy-dom": "20.11.2",
    "typescript": "6.0.3",
    "typescript-eslint": "8.66.0",
    "vite": "8.2.1",
    "vitest": "4.1.10",
    "wrangler": "4.120.0"
  },
  "dependencies": {
    "preact": "10.29.8",
    "zod": "4.4.3"
  }
}
```

- [ ] **Step 2: Write failing contract tests**

Cover one valid event and rejection of an inconsistent success count, an unknown enum, more than ten error groups, a message over 200 characters, a counter above 100,000, and an unrecognized field.

```ts
expect(() => parseTelemetryEvent({
  ...validEvent,
  counts: { ...validEvent.counts, success: 99 },
})).toThrow();
```

- [ ] **Step 3: Run the contract test and confirm red**

Run: `npm test -- packages/contracts/src/index.test.ts`

Expected: FAIL because `parseTelemetryEvent` is not defined.

- [ ] **Step 4: Implement the strict V1 contract**

```ts
export type TelemetryDirection = 'remote_to_local' | 'local_to_remote';
export type TelemetryMode = 'time' | 'selected' | 'knowledge_base' | 'auto' | 'local_upload';
export type TelemetryAuthMode = 'openapi' | 'web';
export type TelemetryRunStatus = 'success' | 'partial' | 'failed' | 'cancelled';

export interface TelemetryErrorGroup {
  code: TelemetryErrorCode;
  stage: TelemetryErrorStage;
  count: number;
  message_preview?: string;
}

export interface TelemetryEventV1 {
  schema_version: 1;
  event_id: string;
  plugin_version: PublishedPluginVersion;
  direction: TelemetryDirection;
  mode: TelemetryMode;
  auth_mode: TelemetryAuthMode;
  run_status: TelemetryRunStatus;
  counts: {
    success: number;
    created: number;
    updated: number;
    skipped: number;
    failed: number;
  };
  duration_bucket: TelemetryDurationBucket;
  errors: TelemetryErrorGroup[];
}

export function parseTelemetryEvent(input: unknown): TelemetryEventV1 {
  const event = telemetryEventSchema.parse(input);
  if (event.counts.success !== event.counts.created + event.counts.updated) {
    throw new Error('INCONSISTENT_COUNTS');
  }
  return event;
}
```

Use `.strict()` at every object level. Define these fixed schema V1 allow-lists verbatim:

- Error codes: `NETWORK_TIMEOUT`, `NETWORK_UNREACHABLE`, `HTTP_ERROR`, `AUTH_EXPIRED`, `AUTH_INVALID`, `QUOTA_EXCEEDED`, `API_RESPONSE_INVALID`, `NOTE_PARSE_FAILED`, `VAULT_READ_FAILED`, `VAULT_WRITE_FAILED`, `ATTACHMENT_DOWNLOAD_FAILED`, `UNKNOWN`.
- Stages: `list_notes`, `fetch_note_detail`, `fetch_relationships`, `download_attachment`, `parse_note`, `read_vault`, `write_vault`, `create_remote_note`, `task_setup`, `unknown`.
- Duration buckets: `under_1s`, `1s_3s`, `3s_10s`, `10s_30s`, `30s_2m`, `2m_10m`, `over_10m`.
- Published plugin versions initially accepted: `1.4.4`. Update this allow-list as part of the release process before a telemetry-enabled plugin version is published; do not accept arbitrary semantic versions.

Every listed event field is required, including `errors` (use an empty array when there are none). `message_preview` is the only optional field and must be omitted, not set to `null`, when no safe preview exists. `event_id` must be a UUID. Every note counter is an integer from 0 through 100,000. Each error-group `count` is an integer from 1 through 100,000; `errors` contains at most ten groups; `message_preview`, when present, contains 1 through 200 characters. In addition to `success = created + updated`, enforce `run_status = success` only when `counts.failed = 0`, and `run_status = partial` only when `counts.failed > 0`. A `failed` task is a task-level termination and may have zero note failures; a `cancelled` task has no extra count relationship. Do not infer or add any other fields or cross-field rules in schema V1.

- [ ] **Step 5: Run contract tests and typecheck**

Run: `npm test -- packages/contracts/src/index.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "chore: scaffold telemetry service contracts"
```

---

### Task 2: Implement Double Sanitization and Safe Logging

**Files:**
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/sanitize.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/logging.ts`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/sanitize.test.ts`

**Interfaces:**
- Consumes: `TelemetryEventV1` from `@telemetry/contracts`.
- Produces: `sanitizeEvent(event: TelemetryEventV1): SanitizedTelemetryEvent`, `sanitizeMessage(value: string): string | null`, and `logOperationalEvent(entry: OperationalLog): void`.

`SanitizedTelemetryEvent` has the same shape as `TelemetryEventV1`; construct a fresh object field-by-field and never mutate or spread the input event or error groups. For each error group, preserve only `code`, `stage`, and `count`. Set `message_preview` to the fixed template below for every known non-`UNKNOWN` code, regardless of client input. For `UNKNOWN`, include `message_preview` only when `sanitizeMessage` returns a non-null value.

Fixed templates:

- `NETWORK_TIMEOUT`: `Network request timed out`
- `NETWORK_UNREACHABLE`: `Network unreachable`
- `HTTP_ERROR`: `HTTP request failed`
- `AUTH_EXPIRED`: `Authentication expired`
- `AUTH_INVALID`: `Authentication invalid`
- `QUOTA_EXCEEDED`: `Quota exceeded`
- `API_RESPONSE_INVALID`: `API response invalid`
- `NOTE_PARSE_FAILED`: `Note parsing failed`
- `VAULT_READ_FAILED`: `Vault read failed`
- `VAULT_WRITE_FAILED`: `Vault write failed`
- `ATTACHMENT_DOWNLOAD_FAILED`: `Attachment download failed`

- [ ] **Step 1: Write failing table-driven sanitizer tests**

Test Bearer tokens, cookies, email addresses, query strings, HTTP URLs, POSIX paths, Windows paths, 16+ digit identifiers, 20+ character random strings, quoted note-like content, and a fully safe timeout template. Add a generated-property loop that creates 100 secret-like strings and asserts none survive.

```ts
expect(sanitizeMessage('Authorization: Bearer abcdefghijklmnopqrstuvwxyz')).toBeNull();
expect(sanitizeMessage('Request timed out after 3000ms')).toBe('Request timed out after <duration>');
```

- [ ] **Step 2: Run sanitizer tests and confirm red**

Run: `npm test -- apps/ingest/src/sanitize.test.ts`

Expected: FAIL because the sanitizer does not exist.

- [ ] **Step 3: Implement allow-list-first sanitization**

Known error codes return fixed templates. Unknown previews pass through ordered replacement rules, a final dangerous-pattern detector, and a 200-character cap. Return `null` when safety cannot be proven. Never throw an error that embeds the source string.

For unknown previews, normalize milliseconds/seconds/minutes duration expressions to `<duration>` before the final check. Reject instead of retaining or partially redacting any value that contains a Bearer/Authorization/Cookie/CSRF/token/key/password marker, email address, URL or query string, POSIX/Windows/vault path, 16-or-more-digit identifier, 20-or-more-character random-looking alphanumeric string, JSON/request-body fragment, control character, or quoted content. After normalization, accept only non-empty strings of at most 200 characters composed of letters, numbers, spaces, and the punctuation `.,:;_()[]<>/-`; otherwise return `null`. Tests must verify that `sanitizeEvent` does not mutate its input and that no original preview survives for known codes.

- [ ] **Step 4: Implement metadata-only structured logging**

```ts
type OperationalLog = {
  requestId: string;
  route: string;
  status: number;
  durationMs: number;
  outcome: 'accepted' | 'duplicate' | 'rejected' | 'failed';
};
```

The logger accepts no request, payload, headers, IP, exception message, or stack.

`logOperationalEvent` must build a new log record field-by-field in exactly the order shown above and call `console.log(JSON.stringify(record))`. It must not spread or serialize the supplied object. Add a focused test that passes an object with an extra runtime property and proves the property and its value are absent from emitted output.

- [ ] **Step 5: Run sanitizer tests and typecheck**

Run: `npm test -- apps/ingest/src/sanitize.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ingest packages/contracts
git commit -m "feat: sanitize telemetry at the service boundary"
```

---

### Task 3: Create the D1 Schema and Idempotent Repository

**Files:**
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/migrations/0001_initial.sql`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/wrangler.jsonc`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/repository.ts`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/repository.test.ts`
- Modify: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/vitest.config.ts`

**Interfaces:**
- Consumes: `SanitizedTelemetryEvent` from Task 2 and generated `Env.DB: D1Database`.
- Produces: `type AggregateRegion = string`, `storeEvent(db, event, receivedAt, reportingDate, region): Promise<'inserted' | 'duplicate'>` and `deleteExpiredDetails(db, cutoffIso, limit): Promise<number>`.

`receivedAt` is an ISO timestamp assigned by the Worker, `reportingDate` is a Beijing `YYYY-MM-DD` date, and `region` is a server-derived aggregate code such as `CN-GD`, `US`, or `UNKNOWN`; none is client input. `storeEvent` computes `message_fingerprint` as lowercase SHA-256 hex of the already server-sanitized preview, or the fixed value `none` when no preview exists.

- [ ] **Step 1: Write the migration with five tables**

Create `event_records`, `event_errors`, `daily_stats`, `daily_errors`, and `daily_regions`. Do not add region or installation columns to the first two tables. Add indexes for reporting date, received time, plugin version, error code/stage, and aggregate keys. Add `is_flagged` and `flag_reason` columns to aggregate tables so anomalous traffic can be excluded from trusted totals without creating another detail table.

Use these columns and keys:

- `event_records`: `event_id TEXT PRIMARY KEY`, `received_at TEXT NOT NULL`, `reporting_date TEXT NOT NULL`, `schema_version INTEGER NOT NULL`, `plugin_version TEXT NOT NULL`, `direction TEXT NOT NULL`, `mode TEXT NOT NULL`, `auth_mode TEXT NOT NULL`, `run_status TEXT NOT NULL`, `created_count INTEGER NOT NULL`, `updated_count INTEGER NOT NULL`, `success_count INTEGER NOT NULL`, `skipped_count INTEGER NOT NULL`, `failed_count INTEGER NOT NULL`, `duration_bucket TEXT NOT NULL`, and the non-location idempotency marker `region_counted INTEGER NOT NULL DEFAULT 0 CHECK (region_counted IN (0, 1))`.
- `event_errors`: `event_id TEXT NOT NULL`, `error_index INTEGER NOT NULL`, `error_code TEXT NOT NULL`, `error_stage TEXT NOT NULL`, `error_count INTEGER NOT NULL`, `message_preview TEXT`, `message_fingerprint TEXT NOT NULL`, primary key `(event_id, error_index)`, and foreign key to `event_records(event_id)` with cascade delete.
- `daily_stats`: dimensions `reporting_date`, `plugin_version`, `direction`, `mode`, `auth_mode`, `run_status`; metrics `task_count`, `created_count`, `updated_count`, `success_count`, `skipped_count`, `failed_count`; anomaly fields `is_flagged INTEGER NOT NULL DEFAULT 0 CHECK (is_flagged IN (0, 1))`, `flag_reason TEXT`; primary key across all dimensions.
- `daily_errors`: dimensions `reporting_date`, `plugin_version`, `auth_mode`, `error_code`, `error_stage`, `message_fingerprint`; optional safe sample `message_preview`; metrics `error_count`, `affected_task_count`; the same anomaly fields; primary key across all dimensions.
- `daily_regions`: dimensions `reporting_date`, `region_code`; metrics `task_count`, `success_count`, `failed_count`; the same anomaly fields; primary key `(reporting_date, region_code)`.

All aggregate metric columns are `INTEGER NOT NULL DEFAULT 0`. The migration enables foreign keys. Do not add request bodies, IPs, precise geography, install IDs, or any other columns.

- [ ] **Step 2: Write failing repository tests**

Test that a first event inserts task/error rows and one region aggregate, a retry returns `duplicate` without changing counts, a failed statement rolls back the batch, and expired deletion removes detail without touching aggregate tables.

- [ ] **Step 3: Run repository tests and confirm red**

Run: `npm test -- apps/ingest/src/repository.test.ts`

Expected: FAIL because the migration/repository is missing.

- [ ] **Step 4: Implement prepared and transactional D1 writes**

Use `INSERT ... ON CONFLICT DO NOTHING RETURNING event_id` for the idempotency gate. For a newly inserted ID, use `env.DB.batch([...])` with bound prepared statements for error detail and `daily_regions` upserts. Never interpolate client values into SQL.

The idempotency gate and every dependent write must be in one `db.batch()` so any failed statement rolls back the entire event. Put the gate first. Error inserts use their `(event_id, error_index)` key with `ON CONFLICT DO NOTHING`. Increment `daily_regions` only through an `INSERT ... SELECT ... WHERE` guard that sees `event_records.region_counted = 0`, then set `region_counted = 1` as the last statement. Thus a successful retry changes neither error rows nor region totals, including for events with an empty error array. Determine `inserted` versus `duplicate` from the gate statement's `RETURNING` result. Do not perform a non-atomic gate query before the batch.

`deleteExpiredDetails` validates `limit` as an integer from 1 through 500, then atomically deletes `event_errors` and at most that many matching `event_records`, oldest first, using bound `cutoffIso` and `limit`; return the deleted event-record count. It never modifies aggregate tables.

- [ ] **Step 5: Run migration locally and rerun tests**

Create the initial `wrangler.jsonc` now with `name: "dedao-brain-sync-telemetry-ingest"`, `compatibility_date: "2026-08-10"`, `compatibility_flags: ["nodejs_compat"]`, and `d1_databases: [{ "binding": "DB", "database_name": "telemetry-local", "database_id": "local", "migrations_dir": "migrations" }]`. Here `local` is an explicit local-development sentinel, not a production database ID. Task 4 will extend this same file with the entry point, Cron, generated types, and observability.

Run: `npx wrangler d1 migrations apply telemetry-local --local --config apps/ingest/wrangler.jsonc`

Run: `npm test -- apps/ingest/src/repository.test.ts`

Expected: migration and tests PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/ingest/migrations apps/ingest/src/repository.ts apps/ingest/src/repository.test.ts
git commit -m "feat: persist idempotent telemetry events"
```

---

### Task 4: Build the Public Ingestion Worker and Cron Maintenance

**Files:**
- Modify: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/wrangler.jsonc`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/index.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/geo.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/maintenance.ts`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/index.test.ts`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/src/maintenance.test.ts`

**Interfaces:**
- Consumes: contracts, sanitizer, and repository from Tasks 1-3.
- Produces: Worker `fetch(request, env, ctx)` for `POST /v1/events` and `GET /v1/health`, plus `scheduled(controller, env, ctx)`.

Export `resolveAggregateRegion(cf)`, `beijingReportingDate(at)`, `previousBeijingReportingDate(at)`, `reconcileReportingDate(db, reportingDate)`, `flagAnomalies(db, reportingDate)`, and `runMaintenance(db, at)` as focused test seams. Production `fetch` assigns `receivedAt` and its Beijing reporting date from the same `new Date()` value. `scheduled` passes its Promise to `ctx.waitUntil()`.

- [ ] **Step 1: Write failing request tests**

Cover valid `202`, duplicate `202`, invalid JSON `400`, unsupported schema `400`, body over 8 KiB `413`, wrong method `405`, wrong content type `415`, repository failure `503`, and health `200`. Assert response bodies never echo input.

Use JSON responses `{ "outcome": "accepted" }`, `{ "outcome": "duplicate" }`, `{ "status": "ok" }`, and generic errors `{ "error": "INVALID_EVENT" | "PAYLOAD_TOO_LARGE" | "METHOD_NOT_ALLOWED" | "UNSUPPORTED_MEDIA_TYPE" | "NOT_FOUND" | "SERVICE_UNAVAILABLE" }`. Return `404 NOT_FOUND` for unknown paths. Every response sets `content-type: application/json; charset=utf-8`; `405` also sets the route-appropriate `Allow` header. Accept `application/json` with optional parameters and reject every other media type.

- [ ] **Step 2: Write failing geographic tests**

```ts
expect(resolveAggregateRegion({ country: 'CN', regionCode: 'GD' })).toBe('CN-GD');
expect(resolveAggregateRegion({ country: 'US', regionCode: 'CA' })).toBe('US');
expect(resolveAggregateRegion({ country: 'XX' })).toBe('UNKNOWN');
```

- [ ] **Step 3: Write failing maintenance tests**

Test Beijing date calculation across UTC midnight, previous-day reconciliation into `daily_stats` and `daily_errors`, bounded 500-row cleanup, retry idempotency, preservation of detail when reconciliation fails, and deterministic flags for a daily total above both 100 events and five times the prior seven-day average.

Reconciliation is absolute, not additive: for the requested date, aggregate `event_records` into `daily_stats` and `event_errors` joined to `event_records` into `daily_errors`, then upsert every metric using `SET metric = excluded.metric`. This makes retries idempotent and includes late-arriving rows on a later rerun. Do not delete existing aggregate rows for the date. Use prepared statements only.

For anomaly detection, compare each current row with the average metric for the same full primary-key dimensions except `reporting_date` over the preceding seven calendar dates. Compute it as `COALESCE(SUM(metric), 0) / 7.0`, so missing dates count as zero. Use `task_count` for `daily_stats` and `daily_regions`, and `error_count` for `daily_errors`. Set `is_flagged = 1` and `flag_reason = 'volume_gt_100_and_5x_7d_avg'` only when the current metric is strictly greater than 100 and strictly greater than five times that average; otherwise clear both fields. A missing history has average zero. Run this for all three aggregate tables.

- [ ] **Step 4: Run Worker tests and confirm red**

Run: `npm test -- apps/ingest/src/index.test.ts apps/ingest/src/maintenance.test.ts`

Expected: FAIL because handlers are missing.

- [ ] **Step 5: Implement fetch and scheduled handlers**

Use `crypto.randomUUID()` for request IDs. Read at most 8 KiB before JSON parsing. Access coarse location from `request.cf`, pass only the aggregate code into the repository, and never put it in operational logs. Schedule daily reconciliation at `20 16 * * *` UTC, which is 00:20 Asia/Shanghai. Reconciliation upserts `daily_stats` and `daily_errors`, then flags a dimension only when its total is above both 100 and five times its prior seven-day average; dashboard trusted totals exclude flagged rows and show them in a separate anomaly indicator.

Implement the body cap with a stream reader: stop and cancel as soon as accumulated bytes exceed 8,192, including when `Content-Length` is absent or false. Do not call `request.text()`, `request.json()`, or unbounded `arrayBuffer()` first. Parse UTF-8 only after the bounded read completes. Feed the parsed value through `parseTelemetryEvent`, then `sanitizeEvent`, before repository storage. On all parse/schema failures return only `INVALID_EVENT`; on repository or unexpected failures return only `SERVICE_UNAVAILABLE` and log metadata through `logOperationalEvent` without the exception message or stack.

`resolveAggregateRegion` returns `CN-<REGION>` only for `country === 'CN'` with an uppercase two-letter `regionCode`; returns the uppercase two-letter country code for non-China countries except `XX` and `T1`; otherwise returns `UNKNOWN`. It never returns city, postal code, coordinates, or the raw `request.cf` object.

`runMaintenance` first reconciles the previous Beijing reporting date and flags all aggregate tables. Only after both succeed does it call `deleteExpiredDetails` once with an ISO cutoff exactly 30 days before `at` and limit `500`. If reconciliation or flagging fails, propagate the error and retain all detail rows.

- [ ] **Step 6: Configure Worker best practices**

Set `compatibility_date`, `nodejs_compat`, D1 binding, Cron Trigger, and:

```jsonc
"observability": {
  "enabled": true,
  "head_sampling_rate": 1
}
```

Add `main: "src/index.ts"`, Cron, and the shown observability fields to the existing local config without replacing its D1 binding. Generate types with `npx wrangler types --config apps/ingest/wrangler.jsonc` and commit `apps/ingest/worker-configuration.d.ts`. Configure edge rate limiting for `/v1/events` during deployment; do not implement an application IP table.

- [ ] **Step 7: Run Worker tests, typecheck, lint, and dry run**

Run: `npm test -- apps/ingest && npm run typecheck && npm run lint && npx wrangler deploy --dry-run --config apps/ingest/wrangler.jsonc`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/ingest
git commit -m "feat: accept and maintain anonymous telemetry"
```

---

### Task 5: Build Private Dashboard Read APIs

**Files:**
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/wrangler.jsonc`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/functions/api/dashboard.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/functions/api/errors.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/functions/api/regions.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/functions/api/_shared/query.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/worker-configuration.d.ts`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/functions/api/api.test.ts`

**Interfaces:**
- Consumes: D1 aggregate tables from Task 3.
- Produces: `GET /api/dashboard`, `GET /api/errors`, and `GET /api/regions` JSON responses.

All three handlers accept an injected `now` only through exported pure/query helpers for tests; production uses the request time. Date queries use Beijing calendar dates. With no date parameters, `range=7` is the default and `range=30` is the only alternative; both end on today's Beijing date. Alternatively, callers may supply `from=YYYY-MM-DD&to=YYYY-MM-DD` together for an inclusive range of 1 through 30 days. Reject mixed `range` plus explicit dates, one-sided dates, invalid/non-canonical calendar dates, `from > to`, spans over 30 days, duplicate parameters, and unknown parameters with `400 { "error": "INVALID_QUERY" }`.

Supported filters are intentionally table-specific:

- `/api/dashboard`: `plugin_version`, `direction`, `mode`, `auth_mode`.
- `/api/errors`: `plugin_version`, `auth_mode`.
- `/api/regions`: no dimension filters beyond the date range.

Validate filter values against the shared V1 allow-lists. Reject a filter on an endpoint whose privacy-separated table cannot answer it. Never query raw detail tables from dashboard Functions.

Return these stable shapes (all keys are required):

- `/api/dashboard`: `{ range: { from, to, days }, data_state: 'ready' | 'empty', totals: { tasks, success, created, updated, skipped, failed }, task_health: { success, partial, failed, cancelled, success_rate }, daily: Array<{ date, tasks, success, failed, skipped }>, anomalies: { flagged_rows } }`. Zero-fill each calendar date in `daily`. `success_rate` is successful tasks divided by `success + partial + failed` tasks, excluding cancelled tasks, and is `null` when that denominator is zero.
- `/api/errors`: `{ range, data_state, items, anomalies: { flagged_rows, occurrences } }`. Each trusted item is `{ code, stage, fingerprint, preview, occurrences, affected_tasks, first_seen, last_seen, plugin_versions: Array<{ version, occurrences }>, auth_modes: Array<{ auth_mode, occurrences }>, daily: Array<{ date, occurrences }> }`. Group across allowed version/auth filters by `code + stage + fingerprint + preview`, zero-fill item trends, sort by occurrences descending then stable keys, and return at most 100 items. `preview` is the already sanitized stored sample or `null`.
- `/api/regions`: `{ range, data_state, label: 'Synchronization activity, not unique users', items: Array<{ region_code, task_count, success_count, failed_count }>, anomalies: { flagged_rows, task_count } }`. Sum trusted rows over the selected period; any individual region with total `task_count < 5` contributes only to one combined `OTHER` row. Sort by `task_count` descending then `region_code`.

Trusted totals/items use only rows with `is_flagged = 0`. The anomaly objects summarize excluded flagged rows without exposing their dimensions. A successful query with no trusted or flagged rows uses `data_state: 'empty'`; otherwise use `ready`.

- [ ] **Step 1: Write failing API tests**

Test default 7-day range, 30-day range, ISO date validation, plugin/auth/direction/mode filters, no-data responses, and database failure. Assert region responses group total event counts below five into `OTHER`.

Also test rejection of unsupported cross-filters, flagged-row exclusion/anomaly counts, zero-filled dates, null success rate for no task denominator, stable error grouping/sorting, the 100-item cap, and that low-volume region codes never appear anywhere in serialized output.

- [ ] **Step 2: Run API tests and confirm red**

Run: `npm test -- apps/dashboard/functions/api/api.test.ts`

Expected: FAIL because functions are missing.

- [ ] **Step 3: Implement prepared aggregate queries**

Build filter clauses only from fixed server-owned fragments; bind all values. Return `503` with `{ "error": "DASHBOARD_UNAVAILABLE" }` on storage failure, never a zeroed dataset.

Return all successful and error payloads as JSON with `content-type: application/json; charset=utf-8`. Handlers support GET only and return `405 { "error": "METHOD_NOT_ALLOWED" }` with `Allow: GET` otherwise. Do not log SQL, bound values, or exception messages.

- [ ] **Step 4: Configure Pages D1 bindings and generated types**

Define a local D1 binding and matching `preview` and `production` environment bindings named `DB` in `wrangler.jsonc`. Until Task 7 creates the real databases, use the explicit non-production `database_id: "local"` sentinel for all three and document it in a JSONC comment; never deploy this placeholder configuration. Run `npx wrangler types --config apps/dashboard/wrangler.jsonc`, commit the generated declaration, and keep local D1 isolated by default.

- [ ] **Step 5: Run API tests and typecheck**

Run: `npm test -- apps/dashboard/functions/api/api.test.ts && npm run typecheck`

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/functions apps/dashboard/wrangler.jsonc
git commit -m "feat: expose private telemetry aggregates"
```

---

### Task 6: Build the Maintainer Dashboard

**Files:**
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/package.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/tsconfig.json`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/vitest.config.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/vite.config.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/index.html`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/main.tsx`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/api.ts`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/pages/dashboard.tsx`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/pages/errors.tsx`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/pages/regions.tsx`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/styles.css`
- Test: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/src/dashboard.test.tsx`

**Interfaces:**
- Consumes: the three read APIs from Task 5.
- Produces: private `/dashboard`, `/errors`, and `/regions` views.

Use no router or chart dependency. `main.tsx` selects the view from `window.location.pathname`, treats `/` as `/dashboard`, and renders a shared header with ordinary links to all three paths. Unknown paths render a small not-found view. Keep API response types and a replaceable `TelemetryDashboardApi` interface in `api.ts`; its production implementation calls the same-origin endpoints with `range=7|30` and any supported allow-listed filters, requires `response.ok`, and throws a generic `DashboardApiError` without embedding response bodies.

Each page accepts an optional injected API for tests and owns its loading state. On initial failure, render a panel with `role="alert"` and `Data temporarily unavailable`; never render invented zero metrics. After any successful load, keep that last successful data visible when a range/filter refresh fails and show the same unavailable alert alongside stale data. Ignore stale out-of-order responses using a request generation counter or equivalent; do not use mutable state outside components.

The shared header displays `Telemetry health` and navigation labels `Overview`, `Errors`, and `Regions`. Every page has `7 days` and `30 days` buttons using `aria-pressed`; changing range refetches only that page. The Overview additionally exposes `All` plus fixed V1 select options for plugin version (`1.4.4`), direction, mode, and authentication mode. Errors exposes only plugin version and authentication mode. Regions exposes no dimension selector, matching the API privacy boundary.

Render these minimum views:

- Overview: cards for `Successful notes`, `Failed notes`, `Skipped notes`, `Total tasks`, and `Task success rate`; an accessible SVG labelled `Successful, failed, and skipped note trend`; a visible legend for those three series; task-health counts for success/partial/failed/cancelled; and an anomaly notice when `flagged_rows > 0`.
- Errors: an accessible table with code, stage, occurrences, affected tasks, first/last date, safe preview, plugin-version distribution, and authentication distribution; plus an accessible per-row seven-day trend SVG or text equivalent. Show anomaly counts without exposing flagged dimensions.
- Regions: the exact heading/label `Synchronization activity, not unique users`, an accessible table for region code, tasks, successful notes, and failed notes, and an anomaly notice. Do not add a map.

Use semantic HTML, visible focus states, sufficient color contrast, and SVG `aria-label`/titles. The production build must contain no external runtime CDN assets and no analytics.

- [ ] **Step 1: Write failing dashboard tests**

Test metric cards, 7/30-day filter changes, successful/failed/skipped trend labels, task-health states, unavailable-panel behavior, error/version details, and the exact label `Synchronization activity, not unique users` on regions.

Also test initial failure without fabricated zero cards, stale-data preservation after a failed refresh, out-of-order response protection, route selection, endpoint-specific filter controls, error table/auth details, anomaly notices, and accessible chart/table names.

- [ ] **Step 2: Run UI tests and confirm red**

Run: `npm test -- apps/dashboard/src/dashboard.test.tsx`

Expected: FAIL because views do not exist.

- [ ] **Step 3: Implement the smallest dashboard UI**

Use Preact and accessible HTML/SVG. Do not add a map, realtime transport, public page, member management, or alerting. Preserve the last successful panel data when a refresh fails and show an unavailable state rather than zeros.

- [ ] **Step 4: Run UI tests and production build**

Run: `npm test -- apps/dashboard/src/dashboard.test.tsx && npm run build --workspace apps/dashboard`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard
git commit -m "feat: add private telemetry dashboard"
```

---

### Task 7: Deploy Staging, Protect Access, and Verify End to End

**Files:**
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/README.md`
- Create: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/docs/privacy-and-operations.md`
- Modify: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/ingest/wrangler.jsonc`
- Modify: `/Users/zhengyan/Projects/ai-project/dedao-brain-sync-telemetry/apps/dashboard/wrangler.jsonc`

**Interfaces:**
- Consumes: all prior service tasks and the authenticated Cloudflare account.
- Produces: a staging ingestion URL, private dashboard URL, D1 database ID, and verified production-ready configuration for the plugin-client plan.

- [ ] **Step 1: Run the complete local gate**

Run: `npm ci && npm test && npm run typecheck && npm run lint && npm run build && npx wrangler deploy --dry-run --config apps/ingest/wrangler.jsonc`

Expected: all commands PASS.

- [ ] **Step 2: Create the private GitHub repository and push a feature branch**

Create `AndyZhengyan/dedao-brain-sync-telemetry` as private, push `codex/initial-telemetry-service`, and open a PR against `main`. Do not push directly to `main`.

- [ ] **Step 3: Create one D1 database in `apac` and apply migrations**

Use the Cloudflare binding MCP or Wrangler after resolving the exact database name `dedao-brain-sync-telemetry`. Record only the non-secret database ID in both Wrangler configs. Apply migrations remotely and verify all five tables.

- [ ] **Step 4: Deploy staging Worker and Pages projects**

Deploy the ingest Worker first, then the dashboard. Configure an edge rate-limiting rule for `POST /v1/events`. Do not deploy a production plugin endpoint yet.

- [ ] **Step 5: Configure Cloudflare Access**

Protect the production `*.pages.dev` dashboard and its `/api/*` functions with an allow policy for the maintainer email. Verify an unauthenticated browser receives Access authentication and the maintainer can log in.

- [ ] **Step 6: Run privacy and idempotency probes**

Send a safe synthetic event twice and verify counts change once. Send token/path/ID test payloads and verify unsafe previews are empty. Query D1 to confirm no region exists in detail tables and no request body/IP appears in structured Worker logs.

- [ ] **Step 7: Verify retention and scheduled handler in staging**

Insert dated synthetic rows, invoke the scheduled handler in test mode, and confirm only summarized detail older than 30 days is removed.

- [ ] **Step 8: Document endpoints and hand off to the plugin plan**

Record the staging ingestion origin, schema version, published-version allow-list process, rollback command, and dashboard URL. Never record OAuth tokens or account secrets.

- [ ] **Step 9: Request review and merge approval**

Share the service PR and staging dashboard. Merge only after checks pass and the user explicitly approves.
