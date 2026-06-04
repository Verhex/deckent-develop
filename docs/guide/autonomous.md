# Autonomous Runtime — F3-009

> **Status:** Active (Sprint 226 / AS-6). Authority-bounded continuous loop with human-approval gate.

`deckent autonomous` runs an authority-controlled loop that monitors scheduled flows and nervous-system triggers. Every action passes through a **default-deny** RBAC gate and a **human-approval gate** before execution — the loop never approves or starts sprints on its own.

---

## Subcommands

### `autonomous start`

Start the autonomous loop in the foreground. The loop runs until `--max-iterations` is reached, until you send `SIGINT` (Ctrl+C), or until `deckent autonomous stop` writes a stop marker.

```bash
deckent autonomous start [options]
```

| Option | Default | Description |
|---|---|---|
| `--interval-ms <ms>` | `1000` | Idle-tick sleep between cycles (ms). Reduced to 0 when a trigger is active. |
| `--max-iterations <n>` | unlimited | Stop after N cycles. Useful for smoke tests and CI. |
| `--root <path>` | auto-detected | Project root override. |
| `--lang <code>` | `en` | Language override for output messages (`en` or `tr`). |

**Examples:**

```bash
# Run until interrupted
deckent autonomous start

# Run exactly 5 cycles with fast ticks (for testing)
deckent autonomous start --max-iterations 5 --interval-ms 200

# Run in a specific project root
deckent autonomous start --root /path/to/project

# Turkish output
deckent autonomous start --lang tr
```

**Expected output (EN):**
```
Autonomous runtime started — 0 flow(s), default-deny + approval-gate active
Autonomous loop finished (5 cycles, reason: maxIterations)
```

**Expected output (TR):**
```
Otonom runtime başladı — 0 flow, default-deny + onay-kapısı aktif
Otonom döngü tamamlandı (5 cycle, sebep: maxIterations)
```

---

### `autonomous status`

Show a summary of the currently running (or last stopped) autonomous runtime: pending approvals count and recent audit events.

```bash
deckent autonomous status [options]
```

| Option | Default | Description |
|---|---|---|
| `--root <path>` | auto-detected | Project root override. |
| `--lang <code>` | `en` | Language override (`en` or `tr`). |

**Examples:**

```bash
deckent autonomous status
deckent autonomous status --lang tr
```

**Expected output (EN):**
```
Autonomous runtime status
Pending approvals: 0
No audit events yet.
```

When there are recent audit events:
```
Autonomous runtime status
Pending approvals: 1
Recent audit (3):
  - 2026-06-04T13:00:00.000Z start -> pending: needs_approval
  - 2026-06-04T13:00:01.000Z start -> denied: Unknown requestedBy "unknown" — default-deny (ADR-037)
  - 2026-06-04T13:00:02.000Z read -> executed: allowed
```

---

### `autonomous stop`

Write a stop marker that signals the running loop to halt cleanly after its in-flight cycle completes.

```bash
deckent autonomous stop [options]
```

| Option | Default | Description |
|---|---|---|
| `--root <path>` | auto-detected | Project root override. |
| `--lang <code>` | `en` | Language override (`en` or `tr`). |

**Example:**

```bash
deckent autonomous stop
```

**Expected output (EN):**
```
Stop signal written — active loop will halt after the in-flight cycle.
```

The stop marker is written to `.deckent/autonomous/stop`. The loop reads it after each sleep and aborts the `AbortController` cleanly.

---

## Loop Architecture

Each iteration of the autonomous loop runs a single **cycle**:

```
Trigger → Authority → Approval → Action → Audit
```

| Stage | Description | Adapter |
|---|---|---|
| **Trigger** | Polls scheduled flows and nervous-system events. Returns the next pending trigger or `no_trigger`. | `trigger-adapter` |
| **Authority** | RBAC check via `authority-enforcer.checkAuthority`. Known roles: `brain`, `auditor`, `worker`, `system`. Unknown requesters → immediate `denied`. | `authority-adapter` |
| **Approval** | When authority returns `needs_approval`, the trigger is parked in `.deckent/autonomous/pending.json` and the cycle outcome is `pending`. Human must approve via `deckent_nervous_accept` (MCP) or CLI. | `approval-adapter` |
| **Action** | Executes the registered action handler if approved. By default no handlers are registered — actions resolve but perform no side effects. | `action-adapter` |
| **Audit** | Records every cycle outcome (executed/failed/denied/rejected/pending/no\_trigger) to `.deckent/autonomous-events.jsonl`. | `audit-adapter` |

**Idle vs active ticking:**
- When the cycle outcome is `no_trigger` → the loop sleeps `--interval-ms` before the next iteration.
- When a trigger is found (any other outcome) → the loop yields immediately (sleep 0) and ticks again.

---

## Security Model

The autonomous runtime enforces three invariants that **cannot be overridden at runtime**:

### 1. Default-deny (ADR-037)

Any trigger whose `requestedBy` field is not a recognized agent role (`brain`, `auditor`, `worker`, `system`) is denied immediately without calling the authority enforcer:

```
denied: Unknown requestedBy "unknown" — default-deny (ADR-037)
```

### 2. No auto-approve / no-auto-approve (ADR-040)

When the authority enforcer returns `needs_approval`, the trigger is parked in the pending queue. The loop **never approves its own triggers**. A human operator must resolve pending items:

```bash
# Via MCP tool
deckent_nervous_accept   # approve a pending trigger
deckent_nervous_reject   # reject a pending trigger

# Via CLI status check first
deckent autonomous status   # see what is pending
```

### 3. No auto-sprint-start

The default action-handler registry is **empty**. Even if a trigger is allowed and approved, calling an unregistered action name results in a no-op (no sprint is started, no file is written outside the audit log). Custom action handlers can be registered programmatically by embedding the runtime in your own code — the CLI surface intentionally keeps this empty.

---

## Scheduled Flows

The autonomous loop reads flows from `.deckent/flows/`. Each flow is a JSON file declaring a cron-like schedule and an action. Flows are loaded at `start` time via `FlowRegistry`.

```
.deckent/
  flows/
    nightly-check.json    ← ScheduledFlow definition
  autonomous/
    pending.json          ← Approval queue (auto-created)
    stop                  ← Stop marker (written by `autonomous stop`)
  autonomous-events.jsonl ← Audit trail (auto-created)
```

If `.deckent/flows/` does not exist or contains no flows, the loop runs with 0 flows — it still ticks at `--interval-ms` but every cycle produces `no_trigger`.

---

## Context

| Reference | Description |
|---|---|
| **F3-009** | Feature ID for the autonomous runtime wire (Sprint 226 Task 226-006). |
| **AS-6** | MASTER-PLAN milestone for authority-bounded autonomous operation. |
| **ADR-037** | RBAC authority matrix — Brain/Auditor/Worker role permissions. |
| **ADR-040** | Nervous System architecture — proactive meta-orchestrator. |
| **ADR-079** | Proof-of-Function DoD — Tier-1 classification for CLI surface. |

---

## Related Commands

- [`deckent nervous-subscribe`](../reference/mcp-tools.md) — subscribe to nervous-system notifications
- [`deckent nervous-status`](../reference/mcp-tools.md) — show nervous system status
- `deckent_nervous_accept` / `deckent_nervous_reject` — MCP tools for resolving pending approvals
