# Autonomous Engine — Operations Guide

Complete operating instructions for running deckent's autonomous engine: enabling it,
defining work, running it, **monitoring it**, approving parked work, stopping it safely,
and troubleshooting. For the architecture/concepts, see
[`autonomous-engine.md`](./autonomous-engine.md).

> **Safety first.** The engine is **flag-gated and disabled by default**. When enabled, an
> `auto`-policy entry will spawn a real worker (or sprint) that edits your repository.
> Start with a **clean, committed git tree**, a **small reversible task**, the **`ollama`
> provider** (local, zero-cost), and `--max-iterations` bounding the run. Supervise the
> first runs.

---

## 1. Prerequisites

- **Engine built:** `npm run build` (the `deckent autonomous` command must reflect current
  `src/`). After any engine code change, rebuild before running.
- **A provider:** for safe local runs, **Ollama** (`ollama serve` reachable at
  `localhost:11434`, model pulled, e.g. `ollama pull qwen3.6:27b`). Claude/others also work
  but cost tokens / spawn containers.
- **Clean git tree:** commit/stash first. An autonomous worker writes files; you want a clean
  baseline to review the diff (and to recover if needed).

---

## 2. Enable (flag-gate)

The engine never runs unless you opt in. In `.deckent/config.json`:

```json
{
  "autonomous": {
    "enabled": true,
    "interval_ms": 5000,
    "backlog_path": ".deckent/autonomous/backlog.json",
    "pool_size": 1,
    "reactive": { "enabled": false, "map_path": ".deckent/autonomous/reactive-map.json" }
  }
}
```

- `enabled: false` (default) → `deckent autonomous start` refuses with *"Autonomous mode is
  disabled…"*.
- `reactive.enabled` (default-off) → the nervous-detector reactive bridge (see §9).

---

## 3. Define the backlog

Each unit of work is a **backlog entry** in `.deckent/autonomous/backlog.json`. Manage it
with the CLI:

```bash
# Add a one-off task entry, run locally on ollama, auto policy (runs without approval)
deckent autonomous backlog add \
  --id docs-refresh-1 --title "Refresh local-model guide" \
  --kind task --description "Review docs/guide/local-model-workers.md and improve clarity" \
  --policy auto

# List entries (EN / TR)
deckent autonomous backlog list
deckent autonomous backlog list --lang tr

# Remove (positional or --id)
deckent autonomous backlog remove docs-refresh-1
deckent autonomous backlog remove --id docs-refresh-1
```

The `add` command writes a `one-off` `pending` entry with `policy: auto` (per `--policy`).
To set `provider`/`model`/`kind: sprint`/recurring schedules, edit the entry in
`backlog.json` directly (the entry schema is in [`autonomous-engine.md`](./autonomous-engine.md#concepts)).

**Governance (when does an entry run vs wait):**
- `auto` → runs (after passing RBAC authority).
- `approval-required` → parks for a human (see §7).
- `risk-tagged` → auto for pure/reversible effects, parks for irreversible ones.

---

## 4. Run

```bash
# Bounded, supervised first run: 3 cycles, 1s idle interval
deckent autonomous start --max-iterations 3 --interval-ms 1000

# Run until stopped (no max-iterations)
deckent autonomous start
```

On start the engine **recovers crashed state** (`running` → `pending`), then each cycle:
pulls the next due entry → RBAC authority → per-task policy → EffectClass risk → executes
(`task` → a worker; `sprint` → a full sprint) → audits → updates status. Idle cycles sleep
`interval_ms`.

Flags: `--max-iterations <n>` (stop after N cycles), `--interval-ms <ms>`, `--root <path>`,
`--lang en|tr`.

---

## 5. Monitoring & observability  ⭐

Six complementary surfaces — use them together:

### 5.1 Live terminal (the `start` process)
- **Banner:** `Autonomous runtime started — N flow(s), default-deny + approval-gate active`.
- **Per-cycle feedback (onTick):** prints on each non-idle outcome (executed / failed /
  denied / parked) and fires a **notification once** when a trigger parks for approval.
- **Done line:** `Autonomous loop finished (N cycles, reason: maxIterations|aborted)`.

### 5.2 Status command (any time, separate terminal)
```bash
deckent autonomous status
```
Prints the **backlog summary** — counts by state
(`pending / running / parked / done / failed`) — plus the **pending-approvals** count.

### 5.3 Backlog file (status transitions)
```bash
cat .deckent/autonomous/backlog.json | python3 -m json.tool
```
Watch each entry's `status` move `pending → running → done|failed` (or `→ parked`), and its
`lastRun` / `lastResult` fill in.

### 5.4 Audit event stream (one JSON line per cycle decision)
```bash
tail -f .deckent/autonomous-events.jsonl
```
Every cycle writes an audit record (trigger, action, requestedBy, outcome, reason, timestamp)
via `event-stream.writeEvent`. This is the durable, machine-readable trail.

### 5.5 Worker artifacts (what the spawned worker actually did)
```bash
ls .tasks/*.result .tasks/*.hb         # result + heartbeat files
cat .tasks/task-<id>.result            # files changed, tests, self-assessment, notes
```

### 5.6 Git (the real output)
```bash
git status -s        # what the autonomous worker created/modified
git diff             # review the actual changes before keeping them
```
**This is the ground truth** — the engine's status says "done", but `git diff` shows what
was actually written. Always review before committing autonomous output.

---

## 6. Live-watch recipe (recommended for supervised runs)

Two terminals:
- **Terminal A:** `deckent autonomous start --max-iterations 5 --interval-ms 2000`
- **Terminal B:** `watch -n 2 'deckent autonomous status'` (or repeatedly `cat backlog.json`)
- **After it finishes:** `git status -s && git diff` to review, then keep (commit) or discard
  (`git restore`).

---

## 7. Approvals (parked work)

`approval-required` (and risky `risk-tagged`) entries **park** instead of running. Resolve
them from a separate process (the gate is durable + cross-process):

```bash
deckent autonomous pending              # list parked triggers awaiting a decision
deckent autonomous approve <triggerId>  # approve → runs on the next cycle
deckent autonomous reject  <triggerId>  # reject → recorded, not run
```
No auto-approve ever happens — a decision comes only from an explicit `approve`/`reject`
(ADR-040). Parked approvals also fire a one-time notification to the `start` terminal.

---

## 8. Stop

```bash
deckent autonomous stop      # writes the stop marker; the running loop aborts at its next tick
# or press Ctrl-C in the start terminal (SIGINT → graceful abort)
```
A `--max-iterations N` run stops itself after N cycles.

---

## 9. Reactive triggers (optional, flag-gated — first slice)

When `config.autonomous.reactive.enabled` is true, the engine also reacts to **nervous-system
detections**: a detection → a declarative `reactive-map.json` rule → a durable backlog entry
(deduped) that flows through the normal lifecycle.

`.deckent/autonomous/reactive-map.json`:
```json
{
  "_version": "1.0",
  "rules": [
    {
      "match": { "groupKey": "debt_trend", "minRisk": "medium" },
      "entryTemplate": { "kind": "task", "policy": "approval-required",
        "spec": { "description": "Review the rising tech-debt trend." }, "titlePrefix": "[reactive] debt" },
      "dedupKey": "debt_trend"
    }
  ]
}
```
> **Current limitation (honest):** the reactive bridge is **attach-only** today — the nervous
> observer is not driven inside `start`, and built-in detectors are EXECUTE-phase-gated, so
> **live detections do not yet flow**. The mechanism is built and unit-tested; making
> detections flow (observer-driving / user-registered detectors) and the webhook + repo-watch
> sources are the next slice.

---

## 10. Safety model

- **Flag-gated, default-off** — nothing runs without `autonomous.enabled: true`.
- **Default-deny + no-auto-approve** — RBAC authority gates every action; approvals are
  explicit only.
- **`auto` spawns real work** — an `auto` `task` runs a worker; an `auto` `sprint` runs a full
  sprint that edits the repo. Prefer `ollama` (local, zero-cost) + small reversible scope for
  early runs.
- **Clean tree + review the diff** — start committed; review `git diff` before keeping output.
- **Git-mutation caution** — historically deckent dogfood has been observed mutating its own
  git tree; supervise, keep work committed, and watch `git status` during autonomous runs.
- **Bound it** — use `--max-iterations` for supervised runs.

---

## 11. Troubleshooting

| Symptom | Cause / fix |
|--------|-------------|
| `Autonomous mode is disabled…` on start | `config.autonomous.enabled` is not `true`. |
| Loop runs but nothing executes (always `no_trigger`) | Backlog has no `pending` due entry. `deckent autonomous backlog list` / check `status`. |
| Entry stuck `parked` | It's `approval-required`/risky → `deckent autonomous pending` then `approve`. |
| Entry → `failed` | Read `.tasks/task-<id>.result` `notes` + the audit line in `autonomous-events.jsonl`. |
| Reactive entries never appear | Reactive is attach-only (see §9) and/or `reactive.enabled` is false / map empty. |
| Worker didn't spawn (provider error) | Provider not reachable (ollama down) or auth missing for claude. |

---

## 12. References

- Concepts/architecture: [`autonomous-engine.md`](./autonomous-engine.md)
- Spec/plan: `docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md`,
  `docs/superpowers/plans/2026-06-07-autonomous-execution-engine.md`
- MASTER-PLAN: §10A AS-6, F3-009.
