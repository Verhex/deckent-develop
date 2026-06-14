# Cookbook: Autonomous Mode

Deckent's autonomous engine continuously monitors a backlog of work items and dispatches them automatically. Items can be one-off tasks, recurring schedules (cron), or reactive triggers driven by the Nervous System. A 3-gate governance model (RBAC → policy → risk) ensures you stay in control.

## Prerequisites

Autonomous mode is disabled by default. Enable it in `.deckent/config.json`:

```json
{
  "autonomous": {
    "enabled": true,
    "interval_ms": 5000
  }
}
```

## Starting the Loop

```bash
deckent autonomous start
```

The loop runs until you press `Ctrl+C` or create a stop marker (see below). Without `autonomous.enabled: true` in config the command exits immediately with a notice.

Optional flags:

```bash
deckent autonomous start --interval-ms 10000   # idle-tick sleep (default: 5000ms)
deckent autonomous start --max-iterations 50   # stop after N cycles (testing/CI)
```

## Managing the Backlog

The backlog is stored in `.deckent/autonomous/backlog.json` and is git-trackable.

### Add a one-off task

```bash
deckent autonomous backlog add \
  --id "fix-lint-errors" \
  --title "Fix all outstanding lint errors" \
  --kind task \
  --description "Run eslint --fix across src/ and correct remaining errors manually" \
  --policy auto
```

### Add a recurring task (cron)

Use a 5-field cron expression (`minute hour day-of-month month day-of-week`):

```bash
# Run a dependency audit every Monday at 09:00
deckent autonomous backlog add \
  --id "weekly-audit" \
  --title "Weekly dependency audit" \
  --kind task \
  --description "Run npm audit and open a task for any critical CVEs found" \
  --policy approval-required \
  --cron "0 9 * * 1"
```

Policy values:
- `auto` — dispatched immediately when due
- `approval-required` — parked until you approve (see Approvals below)
- `risk-tagged` — tagged as high-risk; parked for review

### Add a capability entry

Capability entries invoke a structured connector instead of spawning a sprint/task:

```bash
deckent autonomous backlog add \
  --id "daily-db-query" \
  --title "Daily row-count report" \
  --kind capability \
  --capability "db.query" \
  --args '{"sql": "SELECT COUNT(*) FROM orders WHERE created_at > NOW() - INTERVAL 1 DAY"}' \
  --connector "postgres" \
  --cron "0 8 * * *"
```

### List the backlog

```bash
deckent autonomous backlog list
```

Output:

```
status   id               title                           kind       policy
pending  fix-lint-errors  Fix all outstanding lint errors  task       auto
pending  weekly-audit     Weekly dependency audit          task       approval-required
pending  daily-db-query   Daily row-count report           capability auto
```

### Remove an entry

```bash
deckent autonomous backlog remove fix-lint-errors
# or: deckent autonomous backlog remove --id fix-lint-errors
```

## Checking Runtime Status

```bash
deckent autonomous status
```

Example output:

```
Autonomous runtime status
Backlog: 3 total (pending: 2, running: 0, parked: 1, done: 0, failed: 0)
Pending approvals: 1
Recent audit (3):
  - 2026-06-14T09:00:01.000Z start -> pending: needs_approval
  - 2026-06-14T09:00:02.000Z read  -> executed: allowed
  - 2026-06-14T09:00:03.000Z start -> denied: Unknown requestedBy
```

## Approvals

When a backlog entry has `policy: "approval-required"` or the engine flags a trigger as risky, the entry is **parked** until you explicitly approve or reject it.

### List pending approvals

```bash
deckent autonomous pending
```

### Approve a trigger

```bash
deckent autonomous approve weekly-audit
deckent autonomous approve weekly-audit --reason "Reviewed, safe to proceed"
```

### Reject a trigger

```bash
deckent autonomous reject weekly-audit
deckent autonomous reject weekly-audit --reason "Not needed this week"
```

## Stopping the Loop

```bash
deckent autonomous stop
```

This writes a stop marker to `.deckent/autonomous/stop`. The running loop checks for this file on each idle tick and exits cleanly after finishing the current cycle. You can also press `Ctrl+C` for an immediate SIGINT stop.

## Backlog Entry Lifecycle

```
pending → running → done | failed
        ↘ parked (approval-required / risk-tagged hold)

recurring: done → pending  (re-enqueued when next cron cadence after lastRun arrives)
```

A recurring entry that has never run fires immediately on first dispatch. A malformed cron expression is rejected at intake (`backlog add` errors out) so the entry never silently stalls.

## MCP Equivalent

All backlog and approval operations are also available via the `deckent_autonomous` MCP tool:

```
deckent_autonomous({ action: "backlog", op: "add", id: "fix-lint-errors", title: "Fix lint", kind: "task", policy: "auto" })
deckent_autonomous({ action: "status" })
deckent_autonomous({ action: "stop" })
```
