# ADR-G-025: Process Resilience, Recovery & Live Observability

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** runtime contract (crash-handlers installed at boot; persistence + recovery mandatory)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-043 (Brain Crash Recovery) + ADR-044 (State Observability Contract) + ADR-047 Brain-death-procedure aspect
**Crosswalk:** ADR-043 + ADR-044 → ADR-G-025

> **Naming:** "sprint" → "süreç/process" (universal mode naming, ADR-G-024). This contract governs the resilience + observability of any orchestration *process*, not just a sprint.

---

## Context

Brain crash-recovery (old ADR-043) and state-observability (old ADR-044) were two halves of one concern: a process must be **durable, observable, and recoverable**. ADR-043 gave a 3-layer recovery (battle-tested in real crashes — Sprint 267 machine-sleep, Sprint 270 WSL-VM). ADR-044 gave phase-transition persistence + per-task evaluation audit. The 2026-06-30 review merged them and added three Alperen-directed requirements: **provider-failover on Brain crash**, **per-worker live tracking**, and a formal **Brain-death procedure**.

---

## Decision (Today)

### 1. 3-Layer Crash Recovery (from ADR-043)

```xml
<crash-recovery>
  <layer n="1">Entry-point exception handlers (uncaughtException/unhandledRejection)
    + redactSensitive() — API keys/tokens never leak to crash logs.</layer>
  <layer n="2">Atomic checkpoint write (.tmp + renameSync; sprint_checkpoint_interval)
    — half-written checkpoints never read.</layer>
  <layer n="3">State recovery on restart (restoreSprintFromCheckpoint: fresh|complete|
    resume-evaluate) — completed-worker results survive a Brain crash; durationMs fix.</layer>
</crash-recovery>
```

### 2. State Observability (from ADR-044)

Every phase mutation calls `persistPhaseTransition` (atomic, fail-soft); every task evaluation calls `writeEvaluationAudit` (`.deckent/evaluations/<id>/...`) — post-mortem reconstructable GO/NO_GO rationale.

### 3. Brain-crash Provider-Failover  *(NEW — Alperen 2026-06-30)*

```xml
<provider-failover>
  After a bounded delay on Brain failure, the Brain (PID / wherever it runs) FAILS OVER
  from its current provider (e.g. Claude) to an equivalent (OpenAI/Codex), handing over
  the ENTIRE process + current state LOSSLESSLY.
  <supervision>Auditor verifies + APPROVES the takeover. Nervous may be triggered.</supervision>
  <escalation>autonomous first → on autonomous-failure: approved-retry → else: kill-process.</escalation>
</provider-failover>
```

This rests on **Brain provider/model-agnostic self-update**: today Claude is Brain; if tomorrow Codex/GPT-5.5 becomes Brain, the system proceeds **losslessly** (provider-neutral handover; cross-ref ADR-G-008 adapter).

### 4. Per-Worker Live Observability  *(NEW — Alperen 2026-06-30)*

During EXECUTE, each worker's **instant status** is trackable by **human AND system**, **everywhere** (dashboard + terminal + CLI + MCP), live or last-snapshot:

```
worker-1: starting provider (claude) → running checks → understood context
        → writing .plan → evaluating plan-phase → …
```

`.log` files are insufficient — a **structured progress-stream** is required (ties TERM-LIVE run-status footer + ADR-G-033 dashboard + ADR-G-009/TRN trace). (= WORKER-LIVE-TRACE.)

### 5. Brain-death Procedure  *(folds ADR-047 procedure aspect)*

A formal procedure for Brain death: fallback/retry **steps at system AND user level**, and **at which stage `deckent finalize --force` (or equivalent) is triggered** — plus the **tool** that drives it. (The dogfood *manual worktree-repair* protocol is separate, in ADR-D-007; this is the automated/user-level recovery procedure.)

---

## Intent / Roadmap (Tomorrow)

- **Failover + escalation engine** (provider-failover + auditor-approved-takeover + nervous-trigger + autonomous→retry→kill ladder) — today the recovery is single-provider; tomorrow it is provider-failover-capable.
- **WORKER-LIVE-TRACE** wired to TERM-LIVE + ADR-G-033 dashboard + MCP — the structured per-worker progress-stream replaces `.log` tailing.
- **Dashboard-reconcile** (ADR-044's known gap): finalize must reconcile `.dashboard`/`/api/status` with sprint-state (no stale "EXECUTE %80" after COMPLETE).
- **BRAIN-DEATH-PROCEDURE tool** + tie to `feedback_finalize_force_orphan_state`.
- **Brain-provider-self-update** lossless across providers (cross-ref ADR-G-008).

---

## Consequences

**(+)** Process state is durable, observable, recoverable, and (tomorrow) provider-resilient — the orchestration survives crashes, sleeps, and provider failures. Per-worker live-trace closes the #1 observability gap ("x is doing what, right now?"). Battle-tested core (Sprint 267/270).

**(−)** Provider-failover + escalation + worker-live-trace + brain-death-tool are roadmap (born work-items); today = the proven 3-layer recovery + persist/audit. Dashboard-reconcile gap is known/open (product-sprint).

---

## References / Absorbed

- **Absorbs:** ADR-043 (Crash Recovery) + ADR-044 (State Observability) + ADR-047 (Brain-death procedure aspect).
- **Cross-ref:** ADR-G-008 (provider failover/self-update) · ADR-G-022 (nervous trigger) · ADR-G-020 (auditor authority for takeover-approval) · ADR-G-033 (dashboard) · ADR-G-009/TRN (trace) · ADR-G-024 (process naming).
- **Born:** BRAIN-FAILOVER · WORKER-LIVE-TRACE · BRAIN-PROVIDER-SELFUPDATE · BRAIN-DEATH-PROCEDURE.
