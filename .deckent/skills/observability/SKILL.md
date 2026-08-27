# Observability

## Heartbeat as Liveness Contract
- A long-running worker's liveness is a heartbeat file, not a process handle — write it BEFORE
  starting work and refresh it on every significant step, including a short `currentAction`
  string (e.g. `"editing src/x.ts"`, `"running targeted tests"`). A stale `currentAction` reads
  as a stuck worker even when the process is technically still alive.
- Define staleness as an explicit, documented threshold (e.g. no update in >2 minutes = alert),
  not a vibe. The threshold belongs in the monitor's code and its docs, in one place.
- A heartbeat's `sequence` number must strictly increase — a monitor that only checks the
  timestamp cannot distinguish "one slow step" from "the writer silently restarted."

## Structured Log Lines, Not Prose
- Prefix every log line with a fixed, greppable tag identifying its origin component (e.g.
  `[deckent] Sprint started via dashboard (jobId: ...)`), not free prose — an operator grepping
  logs during an incident needs to filter by component before they need to read sentences.
- Put identifiers (job/task/sprint id) in the line itself, not only in a structure the log
  viewer might not render — a copy-pasted log line must be self-describing on its own.
- Log the OUTCOME with the same tag prefix as the action that triggered it, so success/failure
  pairs are trivially greppable as a matched set.

## Correlation-ID Threading
- Every log line, heartbeat, and result file touching one task must carry the same
  `sprintId`/`taskId`/`workerId` triple — that triple is what lets an operator reconstruct one
  task's full timeline across process boundaries (worker process, monitor, dashboard).
- Never regenerate or reformat an id mid-pipeline (e.g. truncating a taskId for a log line) —
  a shortened id defeats the very correlation the id exists for.

## Dashboards Are Derived, Never Source of Truth
- A dashboard/status file is rebuilt from raw state (heartbeats, locks, results) on every scan
  and OVERWRITTEN wholesale — never appended to. Appending turns the dashboard into a second,
  driftable copy of state that can disagree with the raw files it was supposed to summarize.
- If the dashboard and the raw state ever disagree, the raw state wins by construction — the
  dashboard has no independent authority, so there is nothing to "reconcile," only to
  regenerate.

## Alert-Threshold Discipline
- An alert fires on a crossed, documented threshold (stale heartbeat, stale lock, failed
  provider probe) — never on "looks unusual." An undocumented heuristic threshold is a future
  false-positive/false-negative nobody can explain.
- Distinguish a transient blip (one missed scan) from a sustained condition (N consecutive
  scans past threshold) before alerting — a single noisy scan should not page anyone.
- Every alert must name the specific condition and the specific id (task/worker/lock) that
  tripped it — an alert that just says "something is wrong" is not actionable.

## Anti-Patterns
- A heartbeat written once at start and never refreshed — indistinguishable from a dead worker.
- Free-prose log lines with no component tag and no id, unparseable during an incident.
- A dashboard that appends new entries instead of being overwritten from raw state each scan.
- Alerting on an undocumented, un-versioned heuristic threshold.
- Truncating or reformatting a correlation id partway through a pipeline.

## Karpathy Notes
- **Simplicity first:** One heartbeat file, one dashboard file, rebuilt wholesale each scan —
  don't build an event-sourcing/append-log system until a single overwritten snapshot genuinely
  stops being enough.
- **Surgical:** Adding a new alert type touches the threshold check and its doc line — resist
  restructuring the whole monitor loop to add one condition.
- **Goal-driven:** DONE means an operator can reconstruct one task's full timeline from
  heartbeat + logs + result using only the correlation id — not that a log line was emitted.
