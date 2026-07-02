# File Watch Hygiene (fs.watch + Poll Fallback)

> Sprint 358-001 (APR-XPROC-CORE, MASTER-PLAN Sıra-462): a relay/REPL that attached an
> ApprovalStore AFTER another process had already written pending requests to disk never
> learned about them. `approval-store-watch.ts` is the reference pattern below.

### fs.watch Is Never Enough Alone
- `fs.watch` is known-unreliable on WSL and network filesystems (Yasa #2 — every
  environment) — it can silently miss events.
- Run an ALWAYS-ON poll fallback alongside `fs.watch`, never merely as a fallback for a
  *failed* `watch()` call. The poll loop is what carries correctness; `fs.watch` is a
  latency optimization on top of it, not the source of truth.
- Wrap the `fs.watch()` call itself in try/catch — EMFILE and unsupported-platform errors
  must not crash the watcher; the poll fallback keeps running regardless.

### Unref Every Handle (ADR-G-013 / MOAT-2)
- `.unref()` both the `fs.watch()` handle AND the poll `setInterval` timer. An un-unref'd
  handle is exactly the bug class MOAT-2 root-caused for the sprint coordinator: it keeps
  the process alive long after the logical work is done.
- `dispose()` must be idempotent and stop every timer/handle so no handler fires again for
  an in-flight event after disposal.

### Store-Replay on Attach
- Run one synchronous scan immediately, before returning from the constructor/factory —
  anything already on disk at attach time must be reported exactly like a live change. A
  watcher that only reacts to FUTURE events has a permanent blind spot for state written
  before it started.

### Dedup + Atomic-Read Tolerance
- Track "already reported" with a `Set` keyed by id (and `id:category` when a record can
  transition through states) — a poll tick and an `fs.watch` event firing for the same
  change must not double-report.
- Reuse the existing tolerant read/categorize helper (e.g. `Store.load`) for every scan
  instead of re-deriving parsing — a torn/mid-rename write must be silently skipped and
  picked up cleanly on the NEXT scan, not crash the watcher.

## Anti-Patterns to Avoid
- Using `fs.watch` as the only signal — silent misses on WSL/network filesystems.
- Falling back to polling only inside the `watch()` catch block — poll must run always.
- Leaving the poll timer or watch handle ref'd — blocks process exit (MOAT-2 class bug).
- Re-parsing/re-deriving file content instead of reusing the module's own tolerant reader.

## Karpathy Notes
- **Surgical:** this watcher is a PEER to the consumption side, not a wrapper — reuse the
  existing read/categorize helper rather than duplicating parsing logic.
- **Goal-driven:** "watches for changes" isn't done until it also replays pre-existing
  state and survives a torn write — both are part of the goCriteria, not edge-case polish.
