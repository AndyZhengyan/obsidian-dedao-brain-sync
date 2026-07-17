# Issue #192: Knowledge-base sync includes subscribed bloggers

## Goal

When a knowledge base is selected for scheduled or manual knowledge-base sync, include notes from every Douyin/TikTok blogger subscribed by that knowledge base. Keep the existing UI and existing note identity/path conventions.

## Product behavior

- Selecting a knowledge base implicitly selects all of its subscribed bloggers; no new setting is added.
- Normal knowledge-base sync applies the same configured start-date and note-type filters as normal sync.
- Explicit full sync and explicitly selected single-article sync keep their current filter-bypass behavior.
- A failure fetching or writing one note is recorded while remaining notes continue.
- Blogger note IDs remain string-preserving and use the existing `blogger_` namespace.

## Implementation shape

Reuse the existing knowledge-base content enumeration, which already returns blogger posts. Route normal knowledge-base candidates through the shared recent-note and note-type filters instead of maintaining a partial date-only copy. Keep explicit full/single-item modes outside that filtering path.

Failures are isolated per note. A run with note-level failures must not advance its durable checkpoint past failed work in a way that prevents retrying those notes on the next run.

## Acceptance boundary

- Both API modes include all subscribed-blogger posts returned for the selected knowledge base.
- Normal runs honor start date, maximum-days limit, and enabled note types.
- Full and explicit single-item runs preserve existing semantics.
- One note failure does not stop later notes and remains retryable.
- No UI, copy, path, ID, timestamp, or version change.

