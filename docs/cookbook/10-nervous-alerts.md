# Cookbook: Nervous System Alerts

The Deckent Nervous System is a proactive meta-orchestrator (ADR-040) that monitors sprints in real time, detects anomalies, and surfaces actionable alerts — before problems become failures.

---

## What the Nervous System Does

12 built-in detectors watch your sprint continuously:

| Detector | What it catches |
|---|---|
| `stale-worker` | Worker heartbeat older than 2 minutes |
| `scope-collision` | Two tasks writing to the same file at once |
| `scope-collision-rate` | Repeated scope collision pattern within a sprint |
| `debt-trend` | Growing tech-debt count across recent sprints |
| `agent-routing` | Agent assignment failure or low utilization |
| `agent-routing-anomaly` | Unusual routing pattern vs historical baseline |
| `directives-protection` | DIRECTIVES.md modified mid-sprint |
| `task-mode-idle` | Autonomous/task-mode engine idle too long |
| `build-failure-recurrence` | Same build error occurring in multiple tasks |
| `token-spike` | Unusual token usage spike on a single task |
| `notification-delivery-health` | Undelivered notifications accumulating |
| `dead-event-stream` | Event stream channel silent unexpectedly |

Each detector fires a `NervousNotification` with a severity level (`info`, `warning`, `critical`, `emergency`) and a list of proposed actions. You decide whether to accept, reject, or ignore each suggestion.

---

## Enable the Nervous System

The Nervous System is **disabled by default**. Enable it in `.deckent/config.json`:

```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced"
  }
}
```

Or via the MCP tool:

```
deckent_nervous_config  →  { "action": "set_preset", "preset": "balanced" }
```

### Authority Modes

| Mode | Low-risk actions | Medium-risk | High-risk |
|---|---|---|---|
| `strict` | suggest (30m wait) | approve required | approve required |
| `balanced` | autonomous | suggest (30m wait) | approve required |
| `autopilot` | autonomous | autonomous | suggest (5m wait) |
| `full-auto` | autonomous | autonomous | autonomous¹ |

¹ Five safety-floor actions can never be executed automatically regardless of mode.

Default: `balanced`.

---

## Typical Alert Flow

### 1. A Detector Fires

During a sprint, the `stale-worker` detector notices worker `w-003-001` has not updated its heartbeat for 3 minutes:

```
[Nervous] ⚠ WARNING — stale-worker
  Worker w-003-001 (task 003-001) has not updated heartbeat for 3m 12s.
  Suggested action: kill-and-respawn
  notification-id: ns-a1b2c3d4
```

In `balanced` mode this is a medium-risk action, so it waits for your approval.

### 2. Check the Dashboard

```bash
deckent nervous
```

```
  Nervous System Dashboard

  Pending (1)
    [1] ⚠ WARNING — stale-worker  (ns-a1b2c3d4)
        Worker w-003-001 has not updated heartbeat for 3m 12s.
        Actions: accept, reject, edit, ignore

  Recent actions (3)
    ✓ kill-orphan-lock  [accepted]  — 12 minutes ago
    ✓ scale-down-workers  [autonomous]  — 1 hour ago
    ✗ expand-scope  [rejected]  — 2 hours ago

  Config  mode: balanced  overrides: 0  quiet-hours: 22:00-08:00
```

### 3. Accept the Alert

```bash
deckent nervous accept ns-a1b2c3d4
```

```
  ✓ Approval queued: kill-and-respawn
```

Deckent kills the stale worker and respawns it with the same task context. The FIX phase takes over automatically.

### 4. Reject the Alert

If you know the worker is fine (slow network, large file write):

```bash
deckent nervous reject ns-a1b2c3d4 --reason "large file write in progress"
```

```
  ✗ Rejected: kill-and-respawn  (reason: large file write in progress)
```

The notification is removed from the queue and the decision is recorded in history.

---

## CLI Reference

### `deckent nervous`

Show the dashboard: pending notifications, recent actions, and config summary.

```bash
deckent nervous [--lang en|tr]
```

### `deckent nervous accept <id>`

Accept a pending notification. Routes the decision through the live executor if one is running (IPC queue); dismisses without executing if no executor is active.

```bash
deckent nervous accept ns-a1b2c3d4
deckent nervous accept ns-a1b2   # prefix match
```

### `deckent nervous reject <id>`

Reject a pending notification. Records the decision in history.

```bash
deckent nervous reject ns-a1b2c3d4
deckent nervous reject ns-a1b2c3d4 --reason "false positive"
```

### `deckent nervous edit <id>`

Mark a notification as accepted-with-modification (advanced: modify the action payload before accepting). The notification is removed from the queue and a modified-accept record is written to history.

```bash
deckent nervous edit ns-a1b2c3d4
```

### `deckent nervous undo <action-id>`

Undo a recent reversible action (only actions flagged `reversible: true` in history).

```bash
deckent nervous undo cli-1718360000-abc123
```

### `deckent nervous history`

View the action history log.

```bash
deckent nervous history
deckent nervous history --limit 50
deckent nervous history --since 2h    # last 2 hours
deckent nervous history --since 30m   # last 30 minutes
deckent nervous history --since 1d    # last 24 hours
```

### `deckent nervous log`

View the raw history log, optionally following new entries live.

```bash
deckent nervous log
deckent nervous log --follow    # live tail (Ctrl+C to exit)
```

### `deckent nervous accept-panic <task-id>`

Approve a PanicGuard-blocked worker kill. The PanicGuard blocks automatic worker termination for high-risk tasks and routes the decision here.

```bash
deckent nervous accept-panic task-003-001
deckent nervous accept-panic task-003-001 --reason "confirmed stale"
```

### `deckent nervous baseline-refresh`

Refresh the `directives_protection` detector baseline to the current `DIRECTIVES.md` content. Run this after intentional mid-sprint directive edits to prevent false-positive alerts.

```bash
deckent nervous baseline-refresh
```

---

## MCP Tools (for Claude Code integration)

| Tool | Purpose |
|---|---|
| `deckent_nervous_subscribe` | Subscribe to real-time notifications (returns pending + starts poll) |
| `deckent_nervous_status` | Show dashboard: pending alerts, recent actions, config |
| `deckent_nervous_accept` | Accept a pending notification by ID |
| `deckent_nervous_reject` | Reject a pending notification by ID |
| `deckent_nervous_config` | Read or update authority mode and action overrides |

### Subscribe and Watch via MCP

```
deckent_nervous_subscribe
→ { subscribed: true, subscriberId: "sub-xyz", pending: [...] }
```

The response includes any currently pending notifications so you can respond immediately without polling.

### Accept via MCP

```
deckent_nervous_accept  →  { "id": "ns-a1b2c3d4" }
→ { accepted: true, notificationId: "ns-a1b2c3d4", queued: true }
```

### Configure Authority Mode via MCP

```
deckent_nervous_config  →  { "action": "set_preset", "preset": "autopilot" }
deckent_nervous_config  →  { "action": "read" }
deckent_nervous_config  →  { "action": "reset" }
```

---

## Configuration Reference

All Nervous System config lives under `nervous_system` in `.deckent/config.json`:

```json
{
  "nervous_system": {
    "enabled": true,
    "mode": "balanced",
    "actionOverrides": {
      "kill-and-respawn": "approve",
      "expand-scope": "reject"
    },
    "notifications": {
      "throttle_ms": 300000,
      "quiet_hours": {
        "start": "22:00",
        "end": "08:00"
      }
    }
  }
}
```

| Key | Type | Default | Description |
|---|---|---|---|
| `enabled` | boolean | `false` | Enable/disable Nervous System |
| `mode` | string | `"balanced"` | Authority mode preset |
| `actionOverrides` | object | `{}` | Per-action policy overrides (override the mode preset for specific action IDs) |
| `quiet_hours` | object | `22:00–08:00` | Suppress non-emergency alerts during these hours |
| `throttle_ms` | number | `300000` | Minimum ms between notifications from the same detector |

---

## Tips

- **Start with `balanced` mode** — autonomous on low-risk, asks on medium and high. Upgrade to `autopilot` once you trust the detectors.
- **Use `--follow` for live monitoring** — `deckent nervous log --follow` shows real-time decisions while a sprint runs.
- **Rejecting teaches the system** — rejection history is recorded and feeds the outcome tracker for future routing decisions.
- **`baseline-refresh` after planned DIRECTIVES edits** — prevents `directives-protection` from treating intentional changes as tampering.
- **Safety floor is always on** — five locked actions cannot run autonomously in any mode. See [Authority Matrix](/docs/architecture/authority-matrix.md).

---

## Related

- [Nervous System Architecture](/docs/architecture/authority-matrix.md)
- [Autonomous Engine](/docs/guide/autonomous.md)
- [Cookbook: Watch Sprint Status](/docs/cookbook/05-status-and-watch.md)
