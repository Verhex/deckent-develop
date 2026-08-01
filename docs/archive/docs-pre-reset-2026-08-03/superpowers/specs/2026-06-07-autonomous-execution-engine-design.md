# Autonomous Execution Engine — Design Spec

**Date:** 2026-06-07
**Status:** Approved (brainstorm) — pending spec review
**Feature:** F3-009 (Autonomous continuous runtime) / AS-6 (Otonom + process/batch mode)
**Sub-project:** 1 of 5 — *Autonomous Execution Engine* (the foundational engine)
**Quality bar:** god-level, enterprise-ready. **NOT an MVP.** ([[feedback_no_minimum_no_mvp_deckent]])

---

## 1. Vision

`deckent autonomous` is a **continuously-running engine that, using the connected
providers (multi-provider fleet), autonomously executes a task-list / backlog of
internal work — recurring (fixed), one-off, and reactive — within authority + policy
governance.** It is a production-grade product surface for three personas on one
engine:

- **Solo** (AI-assistant + solo developer) — a simple backlog, mostly `auto` policy.
- **Developer** (solo + team) — mixed policy, recurring project tasks.
- **Enterprise** (up to ~10,000-person org) — RBAC/tenant-scoped, `approval-required`
  defaults, durable audit chain, concurrent execution.

This is **not** documentation-specific (the earlier doc-cleanup framing is dropped —
it was one example workload, never the goal). It is general-purpose autonomous
orchestration: any internal task, any connected provider, continuously.

**Product-vs-self invariant:** "autonomous mode" is a *product capability* for
deckent's users. It does **not** change the human-approval gate on *Claude (me)*
starting deckent sprints during development. (MASTER-PLAN F3-009 note.)

---

## 2. Goals / Non-Goals

### Goals (this spec)
1. A **durable, declarative backlog model** (recurring + one-off + reactive entries),
   git-trackable, with per-entry policy, provider/model, and status lifecycle.
2. A **hybrid trigger layer** composing three sources into one stream: backlog-due,
   scheduled-flow (F3-002/005), and reactive (nervous detector-registry / F3-007
   event triggers).
3. A **three-gate governance pipeline**: RBAC authority (ADR-037) → per-task policy
   (auto | approval-required) → risk-class (EffectClass / ADR-055). This *separates*
   the two dimensions the Sprint-226 skeleton fused.
4. A **real execution dispatcher**: per-entry `kind: task | sprint`, executed on the
   connected provider fleet (worker dispatch for `task`, sprint-controller for `sprint`).
5. A **continuous runtime loop** with interfaces designed to *not preclude* concurrent
   execution, durable state, and crash recovery.
6. **Flag-gated activation** (`config.autonomous.enabled`, default `false`), default-deny,
   no-auto-approve, with CLI/observability surfaces.
7. **Tier-agnostic modular core + pluggable capability-adapters** so the future
   `deckent solo/develop/enterprise` packaging is not precluded.

### Non-Goals (explicitly deferred)
- **`deckent solo/develop/enterprise` packaging / modular install tiers.** Deferred by
  the user ("henüz planlamadık, ileride ele alırız"). We *design for modularity*; we do
  *not build the packaging* here. This engine is the first proving-ground for it.
- **Full concurrent-execution implementation.** Pass-1 may run serially; the interfaces
  must accommodate a pool without redesign.
- **AS-2 multi-provider fleet completion** (failover / subs→API overflow / Bedrock).
  Parallel dependency. "Connected providers" here means the currently-wired, proven set
  (claude, ollama). The engine routes per-entry `provider/model` through existing
  routing; it does not deliver AS-2.
- **Workflow Composer (F3-008)**, **reactive-source deep build (Sub-project 2)**,
  **work-generation/goal layer (Sub-project 3)**, **dashboard control plane
  (Sub-project 4)**. The reactive trigger source is *wired through a real adapter* here
  (not hollow), but its detector breadth belongs to Sub-project 2.

---

## 3. Reuse-vs-Build Analysis (sunk-cost discrimination)

Discriminating test, applied per component: *"If Sprint 226 did not exist, would I
design this piece this way from scratch?"*

| Component | Current | Same from scratch? | Decision |
|---|---|---|---|
| Cycle shape (trigger→authority→approval→execute→audit; one audit/cycle) | exists, clean (`autonomous-runtime.ts`) | Yes | **REUSE** |
| DI loop + composition (`runtime-loop.ts`) | exists | Yes | **REUSE** |
| Cross-process approval-adapter (`decisions.json`, no-auto-approve) | exists | Yes | **REUSE** |
| Audit sink → `event-stream.writeEvent` | exists | Yes | **REUSE** |
| `AuthorityChecker → allowed\|needs_approval\|denied` | exists, **fuses RBAC + approval-policy** | No — the two dimensions are now separated | **RESTRUCTURE** |
| Backlog model (recurring+one-off+reactive, per-entry policy/provider/status) | absent | — | **BUILD-FRESH** |
| Execution dispatcher (task\|sprint via fleet) | absent (handler map empty by-design) | — | **BUILD-FRESH** |
| Per-task policy gate (auto\|approval\|risk) | absent | — | **BUILD-FRESH** |
| Continuous backlog-draining (durable, recovery) | absent (single-cycle + empty trigger) | — | **BUILD-FRESH** |

**Verdict:** the existing module is ~25% sound safety scaffold (authority/approval/audit/
loop) — reuse is correct, not sunk-cost. The engine substance (~75%) is greenfield
god-level work. This is building the real thing on a correct foundation, not stalling to
preserve prior work. The one component we *improve* (not merely wire) is the
authority/policy split.

---

## 4. Architecture

**Tier-agnostic core + pluggable capability-adapters.** The core engine is
provider-, persona-, and tier-neutral. Tier- and deployment-specific behavior enters
through adapters injected at composition time. This is what makes the future packaging
(solo/develop/enterprise) possible without core branches.

```
                       ┌─────────────────────────────────────────────┐
                       │  composition root (cli/commands/autonomous)  │
                       │  reads config.autonomous.* (flag-gated)      │
                       └───────────────────┬─────────────────────────┘
                                           │ injects adapters
        ┌──────────────────────────────────┼───────────────────────────────────┐
        ▼                                   ▼                                   ▼
┌───────────────┐   next()        ┌───────────────────┐   gate          ┌────────────────────┐
│ Trigger layer │ ───────────────▶│  Runtime loop      │ ───────────────▶│ Governance pipeline │
│ (hybrid 3-src)│                 │ (runtime-loop.ts)  │                 │ 3 gates (below)     │
│ backlog-due   │                 │  REUSE             │                 │                     │
│ scheduled-flow│                 └─────────┬─────────┘                  └─────────┬──────────┘
│ reactive      │                           │ cleared                              │
└───────────────┘                           ▼                                      ▼
        ▲                          ┌───────────────────┐                  ┌────────────────────┐
        │ status writeback         │ Execute dispatcher │                  │ G1 RBAC authority   │
┌───────────────┐                  │ kind=task → worker │                  │    (ADR-037)        │
│ Backlog store │◀─────────────────│ kind=sprint→sprint │                  │ G2 per-task policy  │
│ (durable)     │   result+status  │ -controller        │                  │    (auto|approval)  │
└───────────────┘                  └─────────┬─────────┘                   │ G3 risk-class       │
                                             │                             │    (EffectClass)    │
                                             ▼                             └────────────────────┘
                                   ┌───────────────────┐
                                   │ Audit sink         │
                                   │ event-stream       │  REUSE
                                   └───────────────────┘
```

### Modules (well-bounded; `src/orchestra/autonomous/`)

| Module | Responsibility | New/Reuse |
|---|---|---|
| `autonomous-runtime.ts` | single-cycle contract + DI types | REUSE (extend types) |
| `runtime-loop.ts` | continuous loop + composition root helper | REUSE (extend) |
| `authority-adapter.ts` | G1 — RBAC via `authority-enforcer.checkAuthority` | REUSE |
| `approval-adapter.ts` | durable cross-process approval (`decisions.json`) | REUSE |
| `audit-adapter.ts` | audit via `event-stream.writeEvent` | REUSE |
| `backlog.ts` | backlog store: load/validate/query/status-update | **NEW** |
| `backlog-types.ts` | `BacklogEntry`, `BacklogStatus`, policy/trigger unions | **NEW** |
| `policy-gate.ts` | G2 + G3 — per-task policy + EffectClass risk derivation | **NEW** |
| `execute-dispatcher.ts` | run `task` (worker) or `sprint` (sprint-controller) per provider | **NEW** |
| `trigger-adapter.ts` | hybrid trigger source: backlog-due ∪ scheduled-flow ∪ reactive | EXTEND |

Each module answers: *what does it do, how is it used, what does it depend on?* The
core (`backlog`, `policy-gate`, `execute-dispatcher`, loop) depends only on
`core/` types + the DI interfaces — never on Brain (ADR-008). Enterprise capabilities
(tenant scoping, deep RBAC, durable-audit-chain) attach via the same DI adapters.

---

## 5. Data Model — Backlog Entry

Stored in `.deckent/autonomous/backlog.json` (git-trackable; one array of entries).
Validated with a hand-written validator mirroring existing `validateCostConfig` style
(no new dependency — ADR-010).

```jsonc
{
  "id": "string",                       // stable unique id
  "title": "string",
  "kind": "task" | "sprint",            // execution unit (per-entry choice)
  "spec": {                             // what to do
    // kind=task:   inline task definition (api-surface .tasks shape subset)
    // kind=sprint: { directivesRef: "<path|inline>" } resolved by sprint-controller
  },
  "policy": "auto" | "approval-required" | "risk-tagged",  // G2 governance
  "provider": "claude" | "ollama" | "...",   // optional; per-entry fleet routing
  "model": "string",                         // optional
  "trigger": { "type": "recurring", "cron": "string" }
           | { "type": "one-off" }
           | { "type": "reactive", "detector": "string" },
  "status": "pending" | "running" | "parked" | "done" | "failed",
  "tenant": "string",                   // optional; enterprise scoping (adapter reads it)
  "lastRun": "ISO 8601 | null",
  "lastResult": { "ok": boolean, "reason": "string" } | null
}
```

**State lifecycle:** `pending` → (trigger due) → governance → `running` →
`done` | `failed`; or governance parks → `parked` → (human approve) → `running`.
Recurring entries return to `pending` with `lastRun` set after each run. State is
**durable** (written back to the backlog file atomically) so a process restart resumes
from the persisted backlog, not from zero — the crash-recovery requirement.

---

## 6. Execution Flow (one cycle)

1. **Trigger layer `next()`** returns the next due item from the union of:
   backlog-due (one-off `pending`; recurring whose `cron` is due), scheduled-flow
   (F3-002/005), reactive (nervous detector-registry / F3-007 event). The backlog
   entry travels as `AutonomousTrigger.payload`.
2. **G1 — RBAC authority** (`authority-adapter` → `checkAuthority`, ADR-037):
   *can this actor/tenant perform this action at all?* `denied` → audit + stop.
3. **G2 — per-task policy** (`policy-gate`): `auto` → proceed; `approval-required` →
   park via approval-adapter (durable, cross-process, **no auto-approve**, ADR-040).
4. **G3 — risk-class** (`policy-gate`, when `policy = risk-tagged`): derive EffectClass
   (ADR-055) from the entry's effect; `pure`/`reversible` → proceed; `idempotent`/
   `compensable`/`critical-irreversible` → park.
5. **Execute dispatcher**: `kind=task` → worker dispatch (existing `deckent run` /
   worker path) on the entry's provider; `kind=sprint` → `sprint-controller.runSprint`.
   Multi-provider via existing per-task routing.
6. **Audit** (`audit-adapter` → `writeEvent`): exactly one record per non-idle cycle.
7. **Backlog status writeback** (durable).
8. Loop continues (idle → sleep `intervalMs`; work present → next item).

**Safety invariants (all preserved):** flag-gated (`enabled=false` default) · default-deny
· no-auto-approve (decisions only from explicit accept/reject) · no auto-sprint-start
beyond the entry's own `auto` policy + cleared authority · every decision audited.

---

## 7. Enterprise-Ready Interface Requirements (design-not-preclude)

A 10,000-person org runs this continuously for days. Pass-1 need not *implement* all of
the below, but the interfaces must not preclude them:

1. **Concurrent execution.** The loop's execute step is modeled as submitting to an
   `ExecutionPool` interface (pass-1 implementation may be a serial pool of size 1).
   Adding real concurrency = swap the pool impl + per-entry locking; no loop redesign.
2. **Durable backlog state + crash recovery.** Status lives in the backlog file
   (atomic writes), not in memory. A restart re-reads `pending`/`parked`/`running`
   (a `running` entry interrupted by crash is re-evaluated, not lost) — same posture as
   `deckent recover`.
3. **Long-running observability.** The loop emits per-cycle structured events
   (`event-stream`) and a queryable status (`deckent autonomous status` → backlog
   summary + in-flight + parked). Dashboard/SSE consumption is Sub-project 4 but the
   event stream is the contract.

Baking in serial-only or in-memory state would be the same sunk-cost trap one layer up;
the interfaces above are the guard against it.

---

## 8. Personas (one engine, config-scaled)

| Persona | Config posture |
|---|---|
| Solo | small backlog, `policy: auto`, single-provider, serial pool — "set and forget" |
| Developer | mixed `auto`/`approval-required`, recurring project tasks, multi-provider |
| Enterprise | tenant-scoped entries, `approval-required` defaults, RBAC adapter, durable audit chain, concurrent pool |

No persona forks the core. Differences are config + which capability-adapters the
composition root injects. This is the concrete first instance of the repo-wide modular
architecture (packaging deferred).

---

## 9. Testing Strategy (hermetic)

- **backlog.ts:** load/validate (valid, malformed, missing fields), status lifecycle,
  atomic writeback, recurring re-arm, recovery (re-read after simulated restart).
- **policy-gate.ts:** G2 (auto → proceed, approval-required → park) × G3 (each
  EffectClass → auto/park). Table-driven.
- **authority compose:** denied/needs_approval/allowed feed the cycle correctly.
- **execute-dispatcher.ts:** `kind=task` → worker path (mocked), `kind=sprint` →
  runSprint (mocked); per-entry provider honored; failure → `failed` status.
- **trigger-adapter (hybrid):** union ordering + due-selection across the 3 sources.
- **runtime loop end-to-end (sim):** tmpdir backlog, mocked dispatcher, asserts
  governance → execute → audit → status writeback over multiple ticks. Async only,
  **no spawnSync** (CI hermeticity rule).
- **Tier:** engine core = Tier-0 (unit-sufficient, ADR-079). `deckent autonomous` CLI
  surface = Tier-1 → real-binary `Smoke:` (backlog list/status/add EN+TR, exit codes).

---

## 10. Implementation Sequencing (for writing-plans)

Foundational order (each step independently testable):

1. `backlog-types.ts` + `backlog.ts` (store, validate, durable status) + tests.
2. `policy-gate.ts` (G2 + G3) + tests.
3. `execute-dispatcher.ts` (task|sprint, provider-routed, mocked subsystems) + tests.
4. Authority/policy split: extend `autonomous-runtime.ts` cycle to three gates;
   `authority-adapter` stays RBAC-only + tests.
5. `trigger-adapter.ts` hybrid (backlog-due ∪ scheduled-flow ∪ reactive) + tests.
6. `ExecutionPool` interface (serial impl) + loop integration + recovery + tests.
7. `config.autonomous.*` (flag-gated, default false) + `cli/commands/autonomous.ts`
   extension (backlog list/add/remove/status) + i18n (getMessage, en/tr) + Tier-1 smoke.
8. Activation docs + memory/MASTER-PLAN ledger update.

---

## 11. Honesty Notes

- **"Connected providers" = currently-wired, proven (claude, ollama).** The engine
  routes per-entry `provider/model` via existing routing; AS-2 failover/overflow/Bedrock
  is a parallel dependency, not delivered here. The spec does not imply the full
  multi-provider fleet is ready.
- **Reactive trigger source is wired through a real adapter** (nervous detector-registry
  is opt-in but real; F3-007 event triggers exist) — not a hollow stub. Detector breadth
  is Sub-project 2.
- **Modularity is designed-for, not built.** No `solo/develop/enterprise` packaging in
  this spec.

---

## 12. References

- ADRs: ADR-037 (RBAC authority matrix), ADR-040 (nervous approval gate), ADR-055
  (EffectClass / hybrid scoring), ADR-008 (orchestra import direction), ADR-010
  (no new runtime dep), ADR-079 (proof-of-function tiers), ADR-064 (continuous dispatch).
- MASTER-PLAN: §10A AS-6, F3-001..010, Sprint 226 (autonomous runtime wire), §4G
  (human-interaction wire — APPROVE epic, cross-process approval).
- Memory: `project_deckent_agentic_os_vision`, `project_deckent_runtime_ecosystem`,
  `project_deckent_everyone_everywhere`, `feedback_scale_up_autonomous`,
  `feedback_no_minimum_no_mvp_deckent`, `feedback_god_level_i18n_quality_bar`.
