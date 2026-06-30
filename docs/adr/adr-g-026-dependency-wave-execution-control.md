# ADR-G-026: Dependency-Wave Execution & Control

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** dispatch contract (continuous per-tick; legacy-FIFO escape)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-045 (Wave-Based Execution Semantics) + ADR-064 (TOPP Continuous Dispatch)
**Crosswalk:** 045 (+064) → ADR-G-026

> **Note (Alperen):** The Kahn-topological dependency pipeline is one of our greatest features and it works correctly. But it depends on the dependency being correctly written by the AI tool into DIRECTIVES — and we are removing DIRECTIVES. So dependency must also be analyzable/controllable via our TOOLS. Critical and must be correct.

---

## Context

Multi-task work executes in dependency order. ADR-045 wired `respawnEligibleTasks` (Kahn topological sort) so dependent tasks spawn when their deps complete — a "wave" model. ADR-064 (TOPP) removed the wave-barrier: continuous per-tick re-evaluation (a task spawns the instant its deps are satisfied, no barrier), with a `DECKENT_LEGACY_FIFO` rollback escape and a predecessor-digest in the prompt. Both are dogfood-live (flag flipped 2026-06-10; Sprint 279/280 multi-wave proven). The 2026-06-30 review merges them and adds a TOOL layer for dependency control (since DIRECTIVES is being removed).

---

## Decision (Today)

```xml
<dependency-execution>
  <pipeline>Kahn-topological dep resolution (respawnEligibleTasks). Dependency-satisfied
    set = DONE ∪ MANUAL_REVIEW_REQUIRED (MRR only when disk-deliverable exists; EXECUTING
    still blocks). config dependency_pipeline_enabled=true (dogfood-live).</pipeline>
  <dispatch model="continuous">dispatchTick per-tick: a task spawns the instant ANY dep
    completes — no wave-barrier (TOPP). DECKENT_LEGACY_FIFO=1 = operator rollback to the
    pre-TOPP one-per-tick FIFO. Predecessor-digest embedded in the spawned prompt.</dispatch>
</dependency-execution>
```

> **🔴 ADR-064-W:** the pure planner `planDispatch` (returns DispatchPlan/mode) is **tested-but-UNWIRED** (0 runtime callers); `dispatchTick` decides imperatively via `processQueue`/`maybeRespawn` → test-vs-runtime drift risk. Wire `planDispatch` so the pinned model == the live path.

---

## Intent / Roadmap (Tomorrow)

- **🔴 DEP-TOOL:** today dependency capture depends on the AI tool writing it correctly into DIRECTIVES. **DIRECTIVES is being removed** → dependency must be analyzable / suggestible / controllable / editable via a **TOOL**, terminal-trackable, DIRECTIVES-independent. Even when the AI doesn't catch a dependency, a suggestion+control tool surfaces it. Critical + must be correct.
- **ADR-064-W:** wire `planDispatch` (close the test-vs-runtime drift).
- Wave-robustness under the MOAT (MOAT-1 worktree-merge-race tie).

---

## Consequences

**(+)** Continuous dependency-aware dispatch (no wasted wave-barrier latency) with an operator rollback escape; one of deckent's strongest features, dogfood-proven. MRR-unblock prevents deadlock.

**(−)** Dependency correctness currently relies on AI-written DIRECTIVES (born DEP-TOOL, critical once DIRECTIVES is removed). `planDispatch` is unwired (born ADR-064-W, drift risk). Large-sprint wave-robustness is a monitored concern.

---

## References / Absorbed

- **Absorbs:** ADR-045 + ADR-064.
- **Cross-ref:** ADR-G-024 (modes — dependency execution within a process) · ADR-G-034 (terminal — DEP-TOOL surface) · ADR-G-014 (spawn) · ADR-G-009 (eval — MRR/disk-proof) · MOAT-1.
- **Born / MASTER-PLAN:** DEP-TOOL · ADR-064-W (planDispatch wire).
- **Memory:** `feedback_scale_up_autonomous`.
