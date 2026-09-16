# Competitive intelligence watch

## What it does

The competitive intelligence watch retrieves configured official sources, interprets them through the injected watch policy, and records bounded source receipts. It compares eligible signals with the current evidence baseline, deduplicates durable events, and can queue owner notifications for new reportable alerts. Raw source bodies are not kept in the watch outcome.

The watch only accepts valid HTTPS source definitions and runs through the registered `intelligence.competitor-watch` network capability. A watch run reports alert, suppressed, and issue counts plus one receipt per source.

## Operator commands

Use these three commands:

```bash
deckent intelligence watch run [--dry-run] [--input <fixture>]
deckent intelligence schedule
deckent intelligence status
```

> **Current state:** `watch run` does not complete a watch yet. The chain needs a production
> source interpreter — the step that turns a retrieved source into comparable signals — and none
> is implemented, so the watch capability is deliberately left unregistered and the command
> reports a typed failure instead of pretending to have run. `schedule` and `status` work today.

`watch run` loads configured sources, or uses the JSON source fixture named by `--input <fixture>`. `--dry-run` previews the same retrieval and interpretation path without persisting watch events or source cursors and without sending notifications.

`schedule` ensures the canonical flow exists. It is idempotent: a later call reports the existing flow instead of creating another one. `status` reports the stored watch-event count and the last-run value, or `never` when no last run exists.

## Schedule and catch-up

The canonical flow is `intelligence.daily-competitor-watch` with cron `0 9 * * *` in `Europe/Istanbul`: every day at 09:00 Istanbul local time. Scheduling the flow registers it; a scheduler host must call the flow runner to execute due occurrences.

The flow calculates every missed scheduled occurrence strictly after its durable cursor (or its creation time when no cursor exists) through the supplied clock. It processes missed occurrences in order. For each non-dry-run occurrence it ingests the deterministic mission/work-item pair, invokes the watch capability, then saves the cursor only after the capability completes. A dry run invokes the capability but does not ingest a mission or save a flow cursor.

## Failure and recovery

Unreadable baseline evidence produces a typed `HOLD`; it is not presented as a proven comparison. Retrieval is isolated per source: every receipt has `ok`, `unchanged`, or `hold`. A held source contributes an issue, while other sources can still complete the run.

The flow does not advance its cursor after an incomplete capability outcome or a crash. Mission and work-item identifiers derive from the flow id and scheduled occurrence. Therefore, a replay of a crash after mission ingest reuses the same identifiers; durable event history and stable notification identifiers prevent duplicate effects when the run is replayed.

## Provider enrichment

Provider enrichment is currently `HOLD`. The landed watch does not call a provider to enrich, replace, or infer evidence. It only uses configured official-source retrieval and the injected interpreter, so provider enrichment is not a fallback for unreadable or held evidence.

## Notifications and prerequisites

A non-dry-run alert can be queued only when the live watch capability has a `MemoryStore`, injected fetch/clock/evidence/interpretation dependencies, and an outbox implementing `enqueueOwnerNotification`. It also needs valid source definitions and usable evidence. The service writes event history before it enqueues the owner notification and marks the event reported afterward. In dry-run mode it writes none of those three state surfaces.

A configured notification delivery channel is outside this command's scope: the watch queues to the supplied durable outbox; operators must configure and operate the downstream owner-notification delivery path.
