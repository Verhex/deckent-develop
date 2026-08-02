# ADR-G-025: Process Resilience, Recovery & Live Observability

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=runtime contract (crash-handlers at boot **with `redactSensitive()` wired into the fatal handler — ✅ CRASH-REDACT done 2026-07-01** + atomic checkpoint + phase persistence; eval-audit non-atomic; recovery mandatory) → tomorrow=provider-failover + auditor-approved takeover + WORKER-LIVE-TRACE stream
**Status:** accepted (CRASH-REDACT ✅ done 2026-07-01 — fatal-handler redaction wired+tested [sprint-348-005]; remaining provisionality = failover/live-trace/brain-death-procedure roadmap + EVAL-AUDIT-ATOMIC) · **Date:** 2026-06-30 · **Absorbs:** ADR-043 (Brain Crash Recovery) + ADR-044 (State Observability Contract) + ADR-047 Brain-death-procedure aspect
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
    ✅ redaction IS wired (CRASH-REDACT, sprint-348-005, 2026-07-01): formatFatalAndExit
    passes BOTH message and stack through redactSensitive() before the stderr FATAL
    line and the .deckent/crashes/<ts>.log write — sk-/Bearer/API_KEY patterns are
    masked in both sinks (proven by tests/cli/error-handler-redact.test.ts against the
    REAL crash-log file). Residual ceiling: redactSensitive is a fixed allowlist — AWS
    AKIA…/ghp_…/JWT/generic password= are NOT masked (REDACT-COVERAGE follow-up).</layer>
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

## Amendment — 2026-07-30: Universal Execution Recovery Lane

**Owner:** Alperen · **Status:** accepted · **Reason:** Sprint 479 proved that
checkpoint recovery alone is insufficient. A coordinator may remain alive while making
no progress; a task may fail before dispatch yet be projected as worker `NO_GO`; a stale
dashboard may report workers that were never born; and finalize may clear PID authority
before the owned process actually exits. A sprint-only repair would reproduce the same
failure in Run, Flow, Do, Autonomous, Mission and Process.

### A. Dual-lens scope

This amendment applies simultaneously to:

1. deckent's development repository and dogfood operation; and
2. the shipped product across solo, team and enterprise deployments.

Dogfood may enable additional diagnostics and failure injection, but it MUST NOT define a
different lifecycle truth. Product and dogfood consume the same recovery contract through
environment/platform adapters.

### B. One execution-attempt authority

Every executable mode binds work to one provider-neutral identity:

```xml
<execution-attempt-identity>
  tenantId · projectId · executionId · generation · attemptId
  · taskId? · role · processIdentity? · leaseFence
</execution-attempt-identity>
```

`executionId` is the identity used by admission, lock, PID/process ownership, checkpoint,
status, settlement and recovery. A timestamp-generated lock alias is not a second run
identity. Dashboard, `.tasks`, PID files and status documents are projections; they never
override the attempt/settlement authority.

The lifecycle is:

```text
PREPARED → ADMITTED → DISPATCHED → RUNNING → LANDED → COMPLETED
               └→ NOT_DISPATCHED
                                      ├→ FAILED
                                      ├→ PAUSED
                                      ├→ HELD
                                      └→ CANCELLED
```

`NOT_DISPATCHED` is infrastructure/admission truth, not a worker verdict. It retires the
attempt while leaving the logical task eligible for a fenced next generation. Auth,
provider reachability, coordinator recovery and dispatch failures do not consume a worker
quality verdict and do not become task-budget usage without provider-measured execution.

### C. Recovery is a cold lane, not the healthy hot path

Healthy execution performs only its ordinary atomic admission/lease write and append-only
progress/settlement events. It MUST NOT synchronously run a global recovery scan, provider
probe, topology sweep or recovery lock on every scheduler tick or worker dispatch.

The recovery lane opens only from typed evidence:

- explicit `PAUSED` or `HELD`;
- coordinator ownership proven dead;
- lease expiry plus no monotonic progress change across a bounded observation window;
- typed pre-dispatch/admission failure; or
- explicit operator recovery request.

Health classification is `HEALTHY | STALLED | ORPHANED | RECOVERABLE |
UNRECOVERABLE`. Alive-without-progress is `STALLED`, never silently treated as either
healthy or orphaned.

Recovery follows:

```text
inspect → classify → propose → approve/auto-authorize-safe-case
→ CAS recovery claim → quiesce exact attempt → reconcile receipts
→ redrive recoverable units → resume
```

Only provably idempotent cases, such as failure before dispatch/side effect, may auto-redrive.
Unknown process ownership, ambiguous external side effects or competing progress resolve to
`HOLD`. A recovery owner is fenced; if the original attempt progresses or wins settlement,
the recovery claim aborts rather than duplicate execution.

### D. Mode adapters

- **Sprint:** adapts checkpoint task graph, FIX lineage and dependency waves. A terminal
  original attempt is not an active writer; FIX attempts retain canonical kind, provider,
  backend, scope and budget lineage.
- **Run / Flow / Do:** Run Flow generation, immutable recovery manifest and CAS settlement
  are the reference authority. `do` is an ingress adapter, not a separate recovery engine.
- **Autonomous / Mission:** boot recovery MUST NOT blindly rewrite every `running` item to
  `pending`. It inspects the bound attempt: live remains running, proven-dead receives a new
  generation, unknown becomes `HOLD`.
- **Process:** each backlog/process step binds to the same attempt authority. Resumption
  starts at the exact next durable step; external effects require idempotency keys or a
  typed compensation contract.

CLI, terminal, MCP, API and connector surfaces are thin ingress/status adapters per
ADR-G-011. They call the same runtime preparation and recovery services.

### E. Runtime preparation and deadlines

Initial start and recovery use one shared runtime preparation contract carrying effective
config digest, provider/auth authority, attendance and approval evidence, acknowledged
scope, prompt gate, backend, budget and routing decision. Recovery revalidates time-sensitive
auth/reachability/budget evidence while preserving durable operator decisions; it never
silently changes provider or widens authority.

Deadlines are distinct and effective-config-driven:

- dispatch deadline: prepared/admitted work that never obtains a dispatch receipt;
- provider-auth deadline;
- progress-stall deadline: no monotonic progress/receipt change;
- execution-budget deadline: legitimate running-worker containment.

A long execution ceiling cannot make a never-dispatched attempt appear active for hours.

### F. Settlement, shutdown and cleanup

Finalize may stamp terminal state only after exact coordinator/worker quiescence is proven.
Owned termination is bounded `SIGTERM → configured grace → ownership recheck → SIGKILL →
death proof`. PID/lease authority is cleared only after death proof. PID reuse or
unverifiable ownership is `HOLD`, not success.

Cleanup is terminal-only. It must reject a live/resumable execution, clear only stale
ownership-verified projections, preserve immutable receipts/forensics and leave unrelated
executions untouched. Raw task-directory deletion is not a recovery protocol.

### G. Observability and Nervous

One canonical status joins authority with projections and exposes conflicts. Candidate,
dependency-blocked, admitted, dispatched and running are different states; only actually
dispatched workers consume capacity or appear as running.

`STALLED` emits a Nervous recovery proposal containing evidence, proposed actions, risk and
the exact approval surface. Pause thresholds and retry budgets are effective-config values
over logical task lineages; attempts/FIX attempts do not inflate task counts.

### H. Acceptance

The cross-mode acceptance matrix covers healthy and injected failures for Sprint, Run,
Flow, Do, Autonomous and Process:

- pre-prepare and post-prepare/pre-dispatch death;
- provider auth/reachability failure;
- alive-but-stalled and proven-dead coordinator;
- result written with settlement missing;
- PID reuse / namespace-invisible ownership;
- competing recovery claimant;
- external side-effect ambiguity;
- normal healthy execution with unchanged outcome and no recovery scan/lock on its hot path.

No default recovery automation is enabled until duplicate-write prevention, authority
fencing, platform adapters and healthy-flow non-regression are binary-proven.

---

## Consequences

**(+)** Process state is durable, observable, recoverable, and (tomorrow) provider-resilient — the orchestration survives crashes, sleeps, and provider failures. Per-worker live-trace closes the #1 observability gap ("x is doing what, right now?"). Battle-tested core (Sprint 267/270).

**(−)** Crash-log redaction is ✅ wired (CRASH-REDACT done 2026-07-01) but the redactor's pattern-allowlist is a coverage ceiling (no AWS/ghp_/JWT/generic-password masking — REDACT-COVERAGE). `writeEvaluationAudit` is non-atomic (EVAL-AUDIT-ATOMIC). Provider-failover + escalation + worker-live-trace + brain-death-tool are roadmap; today `deckent recover` = cleanup, not the staged brain-death procedure. The proven core is the 3-layer recovery + checkpoint/phase persistence (Sprint 267/270 battle-tested). Dashboard-reconcile gap is known/open.

---

## References / Absorbed

- **Absorbs:** ADR-043 (Crash Recovery) + ADR-044 (State Observability) + ADR-047 (Brain-death procedure aspect).
- **Cross-ref:** ADR-G-008 (provider failover/self-update) · ADR-G-022 (nervous trigger) · ADR-G-020 (auditor authority for takeover-approval) · ADR-G-033 (dashboard) · ADR-G-009/TRN (trace) · ADR-G-024 (process naming).
- **Born:** **CRASH-REDACT** (✅ done 2026-07-01, sprint-348-005 — `redactSensitive()` wired into `formatFatalAndExit` message+stack for BOTH stderr + crash-log; sk-/Bearer/API_KEY absence proven on the real crash-log file) · **REDACT-COVERAGE** (born — extend the redactor allowlist: AWS `AKIA…`, GitHub `ghp_…`, JWT, generic `password=`/`token=`) · **EVAL-AUDIT-ATOMIC** (`writeEvaluationAudit` → `.tmp`+rename) · BRAIN-FAILOVER · WORKER-LIVE-TRACE · BRAIN-PROVIDER-SELFUPDATE · BRAIN-DEATH-PROCEDURE.
