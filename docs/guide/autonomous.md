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

### `autonomous backlog`

Manage the autonomous work queue (`.deckent/autonomous/backlog.json`). The running loop picks up pending entries as `backlog` triggers — they pass through the same authority/approval/audit pipeline as every other trigger.

```bash
deckent autonomous backlog add [options]
deckent autonomous backlog list [options]
deckent autonomous backlog remove <id> [options]
```

#### `backlog add` options

| Option | Default | Description |
|---|---|---|
| `--id <id>` | required | Unique entry id. Duplicate ids are rejected. |
| `--title <title>` | required | Human-readable title. |
| `--kind <kind>` | `task` | Entry kind: `task` (inline description), `sprint` (directives ref), or `capability` (F8 broker verb). |
| `--description <text>` | empty | Task description or directives ref. |
| `--policy <policy>` | `auto` | Execution policy: `auto`, `approval-required`, or `risk-tagged`. |
| `--cron <expr>` | one-off | 5-field cron expression — the entry recurs at this cadence. Omit for a one-off entry. |
| `--capability <verb>` | — | `kind=capability` only: dotted verb to invoke (e.g. `fs.read`, `db.query`). |
| `--args <json>` | — | `kind=capability` only: JSON object of handler args. |
| `--connector <id>` | — | `kind=capability` only: preferred backend/connector id (e.g. `odoo`, `imap`). |
| `--root <path>` | auto-detected | Project root override. |
| `--lang <code>` | `en` | Language override (`en` or `tr`). |

#### Recurring entry (cron cadence)

```bash
# Re-enqueue every night at 03:00 — when a recurring entry completes,
# the loop flips it back to pending at the next due time.
deckent autonomous backlog add \
  --id nightly-debt-sweep \
  --title "Nightly debt sweep" \
  --description "Scan and triage active tech debt" \
  --cron "0 3 * * *"
```

**Expected output (EN):**
```
Backlog entry added: nightly-debt-sweep
```

The cron expression is validated **at intake**: a malformed expression is rejected immediately (i18n, EN/TR), so a recurring entry can never be saved in a state where it silently fails to fire later:

```
Invalid cron expression "0 3 * *": <parser error>
```

#### Capability entry (`--kind capability`)

A `capability` entry runs no task or sprint — it invokes a registered capability-broker verb (file read, HTTP, DB query, mail, …) through the F8 broker:

```bash
deckent autonomous backlog add \
  --id read-pkg \
  --title "Read package manifest" \
  --kind capability \
  --capability fs.read \
  --args '{"path":"package.json"}'

# With a preferred backend/connector:
deckent autonomous backlog add \
  --id sync-orders \
  --title "Pull open orders" \
  --kind capability \
  --capability db.query \
  --args '{"table":"orders"}' \
  --connector odoo
```

Capability entries are also validated at intake (i18n, EN/TR):

- Missing verb → `kind=capability requires --capability <verb> (e.g. fs.read, db.query).`
- `--args` that does not parse to a JSON **object** → `Invalid --args JSON: <error>`

A `--cron` flag combines with any kind — a recurring capability entry re-runs its verb at the cron cadence.

#### MCP parity

The `deckent_autonomous` MCP tool's `backlog_add` action accepts the same parameters: `cron`, `capability`, `capabilityArgs`, `connector` — plus `id`, `title`, `kind`, `description`, `policy`:

```json
{
  "action": "backlog_add",
  "id": "read-pkg",
  "title": "Read package manifest",
  "kind": "capability",
  "capability": "fs.read",
  "capabilityArgs": "{\"path\":\"package.json\"}",
  "cron": "0 3 * * *"
}
```

`backlog_list` and `backlog_remove` mirror the CLI `list` / `remove` subcommands.

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
    backlog.json          ← Work queue (managed by `autonomous backlog`)
    pending.json          ← Approval queue (auto-created)
    stop                  ← Stop marker (written by `autonomous stop`)
  autonomous-events.jsonl ← Audit trail (auto-created)
```

If `.deckent/flows/` does not exist or contains no flows, the loop runs with 0 flows — it still ticks at `--interval-ms` but every cycle produces `no_trigger`.

---

## Work Generator (Self-Generated Work)

When enabled, the loop generates its own backlog candidates from **active tech-debt records** (Memory V2 debt store). The feature is **default-off** and flag-gated under `autonomous.work_generator` in `.deckent/config.json`:

```json
{
  "autonomous": {
    "enabled": true,
    "work_generator": {
      "enabled": true,
      "interval_ms": 600000
    }
  }
}
```

| Key | Default | Description |
|---|---|---|
| `work_generator.enabled` | `false` | Enable debt→backlog work generation. |
| `work_generator.interval_ms` | `600000` (10 min) | Minimum ms between debt scans. Between scans the generator yields nothing — already-enqueued candidates live in the backlog, so nothing is lost. |

Severity mapping: **HIGH/CRITICAL** debt becomes a `risk-tagged` candidate — it parks for human approval under the risk gate instead of executing automatically. NORMAL debt becomes `auto`. Candidates are deduplicated against the backlog by id, so a debt record is enqueued once.

Work-generator triggers have the **lowest priority** among trigger sources (backlog → scheduled-flow → reactive → work-generator) and are fail-safe: an unavailable debt store yields no candidates and never breaks the loop.

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
