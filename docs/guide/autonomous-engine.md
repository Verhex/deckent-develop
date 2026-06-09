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

> **Update (2026-06-10).** Five dispatch wirings went live: recurring cron re-enqueue
> (`applyRecurringReenqueue`), debt-driven work generation (work-generator source),
> `kind=capability` broker dispatch, RBAC `deny` enforcement on machine-initiated
> dispatch (`rbac_policy`), and capability-aware EffectClass risk classification.
> All are default-off or purely additive — see *Dispatch paths* below.

---

## Concepts — the structures it works with

### Backlog entry

Work is declared as **backlog entries**, stored durably in
`.deckent/autonomous/backlog.json` (git-trackable). Each entry:

| Field | Values | Meaning |
|-------|--------|---------|
| `id` | string (unique) | Stable identifier |
| `title` | string | Human label |
| `kind` | `task` \| `sprint` \| `capability` | Execution unit — a single worker task, a full sprint, or a broker capability invocation |
| `spec` | `{ description?, directivesRef?, scopeDir?, capabilityTarget? }` | What to do (task → description; sprint → directives ref; capability → `capabilityTarget { capability, args?, connector? }`, with a non-empty `capability` verb required by validation) |
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

> **Deny outcome (2026-06-10).** With `autonomous.rbac_policy.enabled` (default
> **off**) the policy gate can now also return **`deny`**: every entry-carrying
> trigger is first checked against the RBAC layer under `rbac_policy.role`, and a
> role without the `execute` permission ends the cycle as `denied` — it does **not**
> fall through to the approval queue. See *Dispatch paths §4*.

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
    "pool_size": 1,
    "work_generator": { "enabled": false, "interval_ms": 600000 },
    "rbac_policy": { "enabled": false, "role": "viewer" }
  }
}
```

`enabled` is **`false` by default** — the engine never runs unless you opt in. This is
the safety invariant (no blind auto-on). The 2026-06-10 sub-blocks follow the same
rule: `work_generator` (debt → backlog self-generated work; `interval_ms` throttles
SQLite debt scans, default 600000) and `rbac_policy` (RBAC enforcement on
machine-initiated dispatch; `role` accepts `admin` | `operator` | `viewer`) are both
**default-off**.

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

`add` flags: `--id` (required), `--title`, `--kind` (`task`|`sprint`|`capability`,
default `task`), `--description`, `--policy` (`auto`|`approval-required`|`risk-tagged`,
default `auto`), `--cron` (5-field expression — recurring cadence), `--capability` /
`--args` / `--connector` (kind=capability target), `--root`, `--lang`. All output is
localized (`getMessage`, en/tr). See `docs/guide/autonomous.md` for usage examples.

---

## Architecture — modules

All under `src/orchestra/autonomous/` unless noted. Tier-agnostic core + DI adapters.

| Module | Responsibility |
|--------|----------------|
| `backlog-types.ts` | Entry / status / policy / trigger types |
| `backlog.ts` | Durable store: load, validate, query-due, atomic status writeback, recurring re-enqueue (`applyRecurringReenqueue`), work-gen candidate enqueue (`enqueueCandidates`) |
| `policy-gate.ts` | G2 + G3 (`decidePolicy`, `computeEntryEffectClass` incl. the capability verb rule) |
| `execute-dispatcher.ts` | The `ActionHandler` that runs `task` (`runTaskMode`), `sprint` (`runSprint`), or `capability` (`CapabilityRegistry.invoke`) per the entry |
| `backlog-trigger.ts` | Backlog-due trigger source + `makeHybridTriggerSource` (priority-ordered: backlog → scheduled-flow → reactive → work-generator) |
| `work-generator-source.ts` + `work-generator.ts` | Self-generated work: lowest-priority trigger source + `makeDebtWorkGenerator` (active debt → backlog candidates) |
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

## Dispatch paths — the 2026-06-10 wirings

Five wirings extend the engine's dispatch surface. All are flag-gated or purely
additive; defaults are unchanged. Sources: `runtime-loop.ts`, `backlog.ts`,
`execute-dispatcher.ts`, `policy-gate.ts`, `work-generator-source.ts`.

### 1 · Recurring cadence — `applyRecurringReenqueue`

Every backlog load in the engine first runs `applyRecurringReenqueue` (`backlog.ts`):
each **recurring** entry in `done` status whose next cron run after `lastRun` (epoch
when never run) has arrived is flipped back to `pending`, so a recurring entry fires
again at each cadence instead of dying after its first run. The wrapper persists the
backlog atomically **only when at least one entry changed** — idle ticks never rewrite
the file. A malformed cron expression is caught: the entry stays `done`, a warning is
logged, and the function never throws.

`queryDue` now surfaces **every `pending` entry regardless of trigger type** — for
recurring entries the cron cadence is gated at *flip time* by the re-enqueue pass, so
a pending recurring entry means "due now". A freshly added recurring entry is pending
= first run immediate (matching the epoch-seeded semantics for never-run entries).

### 2 · Trigger source priority

`buildEngineRuntime` composes the hybrid trigger source in fixed priority order:

1. **backlog** (due entries — highest)
2. **scheduled-flow** (the base trigger-adapter)
3. **reactive** (optional `reactiveSource`)
4. **work-generator** (optional `generateWork` — lowest)

One trigger per tick; a lower source is consulted only when every higher one yields
nothing.

The work-generator source (`work-generator-source.ts`) enqueues its candidates into
the backlog FIRST via `enqueueCandidates` (the execute-dispatcher's status writeback
requires the entry to exist there), then yields the first fresh one as a trigger.
Dedupe is by id against entries of ANY status plus within the batch; invalid
candidates are skipped with a warning — the path never throws. The production
producer `makeDebtWorkGenerator` maps ACTIVE tech-debt records to backlog candidates:
HIGH/CRITICAL debt → `risk-tagged` policy (parks under the G3 risk gate), NORMAL →
`auto`. Debt scans are throttled (`work_generator.interval_ms`, default 600000 ms)
because the source polls every idle tick and the debt store opens SQLite; between
scans it returns nothing.

### 3 · `kind=capability` dispatch — F8 broker

A backlog entry with `kind: "capability"` declares non-code work (file-read / HTTP /
DB / mail / ERP) via `spec.capabilityTarget` — `{ capability, args?, connector? }`;
validation requires a non-empty `capability` verb. The execute-dispatcher resolves it
through `CapabilityRegistry.invoke`. The broker **never throws** — every path returns
a `CapabilityResult`: `ok: true` → entry `done` with the fulfilling handler named in
`lastResult.reason`; `ok: false` → `failed` with `code: error`. A capability entry
with no `capabilityTarget`, or a dispatcher with no registry wired, fails with a
clear reason instead of crashing the loop.

The composition root wires a default audited registry via
`createAuditedCapabilityRegistry` (reference + extended + data handler sets;
allowlist-gated handlers DENY by default). Its audit bridge writes **every
invocation** to the ENT-3 audit hash-chain via `writeAuditEvent` — action
`capability.success` / `capability.error`, target = the capability verb, actor/tenant
taken from the entry (`system` / `local` fallbacks). Pass `capabilityRegistry` to
override (tests, custom connector handlers).

### 4 · Policy gate can now `deny` — RBAC enforcement

When `autonomous.rbac_policy.enabled` is `true` (default **false**), every
entry-carrying trigger is FIRST gated through `evaluatePolicy`'s RBAC layer under
`rbac_policy.role` (default `'viewer'`) with action `execute` and the entry's tenant
(`'local'` fallback). A role without the `execute` permission → the gate returns
**`deny`** → the cycle ends `denied`; it does **not** fall through to the approval
queue. Otherwise the trigger proceeds to `decidePolicy` (G2/G3) exactly as before,
and non-backlog triggers (no entry payload) stay authority-only (`auto`).

This converts RBAC from advisory (ADR-037 V1.0) to **enforced on the autonomous
path** — machine-initiated dispatch under an unprivileged role is hard-denied. Sprint
worker-spawn remains advisory.

### 5 · EffectClass rule for capability entries

`computeEntryEffectClass` classifies capability entries by verb: the read-only set
(`echo`, `fs.read`, `http.get`, `env.read`, `db.query`, `mail.search`, `erp.read`) →
`pure`; **any other or unknown verb** (`shell.exec`, `mail.send`, `erp.write`, …) →
`critical-irreversible` (fail-safe, ADR-040 default-deny). Under
`policy: risk-tagged` this means read-only capabilities auto-run while side-effecting
ones park for human approval (risk-tagged park). Description-keyword signals
(publish / deploy / webhook / migration) still take priority over the verb rule.

---

## Current limitations (honest status)

- **MCP parity (mostly closed).** The `deckent_autonomous` MCP tool exists
  (status / start / stop / backlog_add / backlog_list / backlog_remove / approve /
  reject; `backlog_add` supports cron + capability params). `start` only clears the
  stop marker — the long-running loop process itself is still launched via the CLI
  (`deckent autonomous start`).
- **Reactive triggers (sub-project 2 — first slice landed, attach-only).** A nervous-detector
  bridge is built and unit-tested: a detection → declarative reactive-map
  (`.deckent/autonomous/reactive-map.json`, match on `groupKey`/`risk`/`severity`) → a
  durable backlog entry (via an ingester, deduped), flag-gated by
  `config.autonomous.reactive.enabled` (default-off). It is **attach-only** in `start`: the
  nervous observer is not driven and built-in detectors are EXECUTE-phase-gated, so **live
  detections do not yet flow**. Making detections actually flow (driving the observer /
  user-registered detectors) and the **webhook + repo-watch** sources are the sub-project 2
  continuation.
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
