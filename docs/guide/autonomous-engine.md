# Autonomous Execution Engine

The autonomous engine (F3-009 / AS-6) lets deckent **continuously and autonomously
execute a backlog of internal work** — recurring, one-off, and reactive tasks — using
the connected providers, within an authority + policy governance model. It is built to
scale from a solo user to an enterprise on one engine, and is **flag-gated and disabled
by default**.

> **Status (2026-06-07, sub-project 1 — landed).** The engine is implemented, reviewed,
> tested, and merged. **`deckent autonomous start` drives it end-to-end** (flag-gated by
> `config.autonomous.enabled`, default-off): it recovers crashed state, drains the
> backlog through the three gates, and executes each due entry via the fleet — proven
> against the real binary. The backlog management CLI is live. Remaining work is reactive
> trigger breadth and a concurrent execution pool (sub-projects 2+); see *Current limitations*.

---

## Concepts — the structures it works with

### Backlog entry

Work is declared as **backlog entries**, stored durably in
`.deckent/autonomous/backlog.json` (git-trackable). Each entry:

| Field | Values | Meaning |
|-------|--------|---------|
| `id` | string (unique) | Stable identifier |
| `title` | string | Human label |
| `kind` | `task` \| `sprint` | Execution unit — a single worker task or a full sprint |
| `spec` | `{ description?, directivesRef?, scopeDir? }` | What to do (task → description; sprint → directives ref) |
| `policy` | `auto` \| `approval-required` \| `risk-tagged` | Governance gate (see below) |
| `provider` | e.g. `claude`, `ollama` | Optional per-entry provider (multi-provider fleet) |
| `model` | string | Optional model tag |
| `trigger` | `{type:'recurring',cron}` \| `{type:'one-off'}` \| `{type:'reactive',detector}` | When it fires |
| `status` | `pending` \| `running` \| `parked` \| `done` \| `failed` | Lifecycle state |
| `tenant` | string | Optional enterprise scoping |
| `lastRun` / `lastResult` | timestamp / `{ok,reason}` | Completion record |

### Three-gate governance

Every entry passes three independent gates before it runs (one human approval per
trigger; default-deny throughout):

1. **G1 — RBAC authority** (ADR-037): *can this actor/tenant perform this action at
   all?* Denied → stop.
2. **G2 — per-task policy**: `auto` → proceed · `approval-required` → park for human
   approval.
3. **G3 — EffectClass risk** (ADR-055, only for `policy: risk-tagged`): `pure` /
   `reversible` → proceed · `idempotent` / `compensable` / `critical-irreversible` →
   park.

### Per-persona posture (one engine, config-scaled)

- **Solo** — small backlog, `policy: auto`, single provider.
- **Developer** — mixed `auto` / `approval-required`, recurring project tasks, multi-provider.
- **Enterprise** — tenant-scoped entries, `approval-required` defaults, RBAC + durable audit.

No persona forks the core; differences are config + which capability-adapters the
composition root injects.

### Configuration

Under `.deckent/config.json` (all optional; defaults shown):

```json
{
  "autonomous": {
    "enabled": false,
    "interval_ms": 5000,
    "backlog_path": ".deckent/autonomous/backlog.json",
    "pool_size": 1
  }
}
```

`enabled` is **`false` by default** — the engine never runs unless you opt in. This is
the safety invariant (no blind auto-on).

---

## Usage — backlog CLI

These commands manage the backlog today (verified against the real binary):

```bash
# Add a one-off task entry (auto policy)
deckent autonomous backlog add --id docs-1 --title "refresh API docs" \
  --kind task --description "regenerate api-surface from code" --policy auto

# Add an entry that parks for approval
deckent autonomous backlog add --id deploy-1 --title "release prep" \
  --kind sprint --policy approval-required

# List entries (EN / TR)
deckent autonomous backlog list
deckent autonomous backlog list --lang tr     # Turkish labels

# Remove an entry — positional OR --id (both accepted)
deckent autonomous backlog remove docs-1
deckent autonomous backlog remove --id docs-1

# Status (includes a backlog summary: counts by state)
deckent autonomous status
```

`add` flags: `--id` (required), `--title`, `--kind` (`task`|`sprint`, default `task`),
`--description`, `--policy` (`auto`|`approval-required`|`risk-tagged`, default `auto`),
`--root`, `--lang`. All output is localized (`getMessage`, en/tr).

---

## Architecture — modules

All under `src/orchestra/autonomous/` unless noted. Tier-agnostic core + DI adapters.

| Module | Responsibility |
|--------|----------------|
| `backlog-types.ts` | Entry / status / policy / trigger types |
| `backlog.ts` | Durable store: load, validate, query-due, atomic status writeback |
| `policy-gate.ts` | G2 + G3 (`decidePolicy`) |
| `execute-dispatcher.ts` | The `ActionHandler` that runs `task` (`runTaskMode`) or `sprint` (`runSprint`) per the entry's provider |
| `backlog-trigger.ts` | Backlog-due trigger source + `makeHybridTriggerSource` (backlog ∪ scheduled-flow ∪ reactive) |
| `execution-pool.ts` | `ExecutionPool` (serial now, concurrency-ready) + `recoverBacklog` (crash recovery) |
| `runtime-loop.ts` | `buildEngineRuntime` (composition root) + `runAutonomousLoop` (continuous loop) |
| `../autonomous-runtime.ts` | `runAutonomousCycle` (one cycle) + the `PolicyGate` DI interface |
| adapters (`authority-`, `approval-`, `audit-`, `action-`, `trigger-adapter.ts`) | DI ports to RBAC / cross-process approval / event-stream audit / handlers / scheduled-flow |
| `../../cli/commands/autonomous.ts` | The `deckent autonomous` CLI surface |

The composition root `buildEngineRuntime({ projectRoot, config, backlogPath, flows,
policy, runTask, runSprint, reactiveSource? })` wires these into a runnable bundle:
registers the execute-dispatcher under the backlog action, installs the hybrid trigger
(backlog first) and the policy gate, and returns `{ deps, approvalGate }` ready for
`runAutonomousLoop`.

### Safety invariants

- Flag-gated (`enabled: false` default) — opt-in only.
- Default-deny on authority; **no auto-approve** (decisions come only from explicit
  human accept/reject via the durable cross-process approval gate).
- The product "autonomous mode" is independent of the human-approval gate on Claude
  starting deckent sprints during development.
- Durable backlog state + crash recovery: a `running` entry interrupted by a crash is
  reset to `pending` on restart, not lost.

---

## Current limitations (honest status)

- **No MCP tool yet.** `deckent autonomous` (start/backlog/status) is CLI-only; there is
  no `deckent_autonomous*` MCP tool. CLI/MCP parity is a follow-up.
- **Reactive triggers** (nervous detectors / webhooks / repo-watch) are accepted through
  a typed adapter interface but their breadth is sub-project 2.
- **Concurrency** is serial in pass 1 (`ExecutionPool` size 1); the interface is built so
  a bounded concurrent pool swaps in without loop changes.
- **`deckent solo/develop/enterprise` packaging** is a future modular-install direction;
  the engine is designed not to preclude it (tier-agnostic core + pluggable adapters),
  but the packaging itself is not built.

---

## References

- Spec: `docs/superpowers/specs/2026-06-07-autonomous-execution-engine-design.md`
- Plan: `docs/superpowers/plans/2026-06-07-autonomous-execution-engine.md`
- ADRs: ADR-037 (RBAC), ADR-040 (nervous approval), ADR-055 (EffectClass), ADR-079
  (proof-of-function), ADR-064 (continuous dispatch).
- MASTER-PLAN: §10A AS-6, F3-009.
