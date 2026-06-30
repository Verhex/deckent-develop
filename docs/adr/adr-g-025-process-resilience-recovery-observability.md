# ADR-G-025: Process Resilience, Recovery & Live Observability

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=runtime contract (crash-handlers at boot — ⚠️ redaction NOT yet wired into the fatal handler — + atomic checkpoint + phase persistence; eval-audit non-atomic; recovery mandatory) → tomorrow=provider-failover + auditor-approved takeover + WORKER-LIVE-TRACE stream
**Status:** accepted (provisional — crash-log redaction NOT wired into the fatal handler [CRASH-REDACT]; failover/live-trace/brain-death-procedure roadmap) · **Date:** 2026-06-30 · **Absorbs:** ADR-043 (Brain Crash Recovery) + ADR-044 (State Observability Contract) + ADR-047 Brain-death-procedure aspect
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
  <layer n="1">Entry-point exception handlers (uncaughtException/unhandledRejection).
    ⚠️ redaction is NOT yet wired: formatFatalAndExit writes the raw message + stack to
    stderr + the .deckent/crashes/<ts>.log crash-log WITHOUT calling redactSensitive()
    (the helper exists in redact-sensitive.ts but is not applied here) — so a secret in
    an error message/stack CAN currently leak to a crash log. "API keys/tokens never
    leak" is the TARGET; wiring redactSensitive() into the fatal handler is CRASH-REDACT
    (P1-security).</layer>
  <layer n="2">Atomic checkpoint write (.tmp + renameSync; sprint_checkpoint_interval)
    — half-written checkpoints never read.</layer>
  <layer n="3">State recovery on restart (restoreSprintFromCheckpoint: fresh|complete|
    resume-evaluate) — completed-worker results survive a Brain crash; durationMs fix.</layer>
</crash-recovery>
```

### 2. State Observability (from ADR-044)

Every phase mutation calls `persistPhaseTransition` (atomic, fail-soft); every task evaluation calls `writeEvaluationAudit` (`.deckent/evaluations/<id>/...`) — post-mortem reconstructable GO/NO_GO rationale. (Note: `writeEvaluationAudit` is a plain `writeFileSync`, NOT the `.tmp`+`renameSync` atomic write that checkpoint/phase-persistence use — an atomicity-hardening candidate for post-mortem reliability, EVAL-AUDIT-ATOMIC.)

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

A formal procedure for Brain death: fallback/retry **steps at system AND user level**, and **at which stage `deckent finalize --force` (or equivalent) is triggered** — plus the **tool** that drives it. (The dogfood *manual worktree-repair* protocol is separate, in ADR-D-007; this is the automated/user-level recovery procedure.) **State-of-code:** today `deckent recover` does orphan-IPC + stale-lock + post-finalize cleanup + a self-audit gate — it is NOT the staged provider-failover/retry/finalize-force procedure; that procedure is roadmap (BRAIN-DEATH-PROCEDURE).

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

**(−)** **Crash-log redaction is NOT wired** — the fatal handler writes raw message+stack to stderr + the crash-log, so a secret can leak (CRASH-REDACT, P1-security); the "never leak" guarantee is a target, not today's reality. `writeEvaluationAudit` is non-atomic (EVAL-AUDIT-ATOMIC). Provider-failover + escalation + worker-live-trace + brain-death-tool are roadmap; today `deckent recover` = cleanup, not the staged brain-death procedure. The proven core is the 3-layer recovery + checkpoint/phase persistence (Sprint 267/270 battle-tested). Dashboard-reconcile gap is known/open.

---

## References / Absorbed

- **Absorbs:** ADR-043 (Crash Recovery) + ADR-044 (State Observability) + ADR-047 (Brain-death procedure aspect).
- **Cross-ref:** ADR-G-008 (provider failover/self-update) · ADR-G-022 (nervous trigger) · ADR-G-020 (auditor authority for takeover-approval) · ADR-G-033 (dashboard) · ADR-G-009/TRN (trace) · ADR-G-024 (process naming).
- **Born:** **CRASH-REDACT** (wire `redactSensitive()` into `formatFatalAndExit` message+stack for stderr + crash-log + test sk-/Bearer/API_KEY absence; P1-security) · **EVAL-AUDIT-ATOMIC** (`writeEvaluationAudit` → `.tmp`+rename) · BRAIN-FAILOVER · WORKER-LIVE-TRACE · BRAIN-PROVIDER-SELFUPDATE · BRAIN-DEATH-PROCEDURE.
