# ADR-G-013: Graceful Shutdown & Lifecycle

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=**SIGINT** handler (`entry.ts`; SIGTERM registered but runs no cleanup) → `interruptActiveSprint()` (task-level INTERRUPTED) + `killAllSessions()` (tmux) (`sprint-lifecycle.ts` · `tmux.ts`) → tomorrow=mode-independent lifecycle + ORPHAN-START-PROC fix (MOAT-2) + ROLE-GUARD process-role teardown
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-025 (Graceful Shutdown Strategy) · **Supersedes:** —
**Crosswalk:** ADR-025 → ADR-G-013

> Note: the crosswalk flagged ADR-043 / ADR-044 as merge-candidates ("Lifecycle & Reliability"); the final taxonomy kept them **separate** as ADR-G-025 (Process Resilience, Recovery & Live Observability). ADR-G-013 absorbs **only ADR-025**; ADR-G-025 is the sibling lifecycle ADR (cross-referenced, not merged).

---

## Context

When a user hits Ctrl+C, or the process receives SIGINT, a running sprint used to terminate **abruptly** — workers exited without cleanup, task files were left half-written, tmux sessions kept running in the background, and `.tasks/` accrued stale heartbeat + lock files. ADR-025 (Sprint 076) extended the SIGINT handler to coordinate a graceful shutdown.

The 2026-06-30 review confirmed this as **ADR-G** (Global / Constitution): clean teardown is a runtime lifecycle law every user relies on — an orphaned process or a half-written task directory is a trust violation. The review tied it to the live MOAT bugs (orphan coordinator) and to mode-independence (the same guarantee across every mode, not just sprint).

---

## Decision (Today)

**SIGINT graceful shutdown** — the `entry.ts` SIGINT handler runs, in order:

```xml
<sigint-shutdown handler="src/cli/entry.ts">
  <step n="1" fn="interruptActiveSprint()" module="src/orchestra/sprint-lifecycle.ts">
    coordinates graceful shutdown of the active sprint:
    marks tasks INTERRUPTED · aborts heartbeat · releases locks · kills workers.
  </step>
  <step n="2" fn="killAllSessions()" module="src/orchestra/tmux.ts">
    cleans all tmux sessions ("Called on SIGINT for graceful shutdown").
  </step>
  <order>task-state save FIRST (each in-progress task JSON → INTERRUPTED + heartbeat
    ABORTED; there is NO sprint-level sprint-state.json persist today), then session kill.</order>
</sigint-shutdown>
```

**Result:** a clean state after Ctrl+C. The sprint's tasks are marked **INTERRUPTED** (`deckent review` surfaces it); workers are terminated **per-backend** (docker: `docker stop --time` graceful; tmux: window/session kill — not a uniform explicit SIGTERM); `deckent cleanup` leaves no orphan files. **Scope:** this runs on **SIGINT only** — `entry.ts` registers a SIGTERM handler too, but it does **not** run `interruptActiveSprint`/`killAllSessions` (the cleanup is `if (signal === 'SIGINT')`-guarded — SIGTERM-CLEANUP).

**Companion:** `killAllWorkers()` / `killAllSessions()` (`tmux.ts`) are **tmux-scoped** (`tmux kill-session`). Subprocess/docker teardown does **not** come from these — it flows via `interruptActiveSprint()` calling the active **SpawnBackend's** own kill path. Uniform backend-agnostic worker-kill is the ADR-G-014 / ROLE-GUARD roadmap.

---

## Intent / Roadmap (Tomorrow)

- **ORPHAN-START-PROC fix (MOAT-2):** a normal-completion coordinator process can **linger** (recurrence-flagged 🟠) — close the lifecycle so the coordinator always exits on completion, not only on SIGINT. This is a trust-moat: no orphan process survives a clean run. (MASTER-PLAN: MOAT-2, P0.)
- **Mode-independent lifecycle:** graceful shutdown is **uniform across every mode** (sprint | task | process | autonomous | flow — ADR-G-024 Mode Architecture), not sprint-specific; each mode tears down its own workers / sessions / locks the same way.
- **ROLE-GUARD process-role teardown:** shutdown respects **process roles** (ADR-G-020 / ROLE-GUARD — Brain/orchestrator vs worker) so the correct role coordinates teardown and no role-process is orphaned; worker kill is **backend-agnostic** (subprocess/docker/tmux/firecracker) via ADR-G-014.

---

## Consequences

**(+)** Ctrl+C always leaves a clean state — INTERRUPTED sprint, released locks, no orphan tmux sessions; the per-worker variant covers non-tmux backends; `deckent review` surfaces the interruption honestly rather than presenting a silent half-run.

**(−)** Today the clean teardown runs **on SIGINT only** (SIGTERM is registered but its handler does not run the cleanup — SIGTERM-CLEANUP); interrupt is **task-level** (per-task JSON, no sprint-state.json persist); backend-agnostic worker-kill flows through the SpawnBackend, not `killAllWorkers` (tmux-scoped). The **normal-completion path can still leave a lingering coordinator** (MOAT-2, open 🟠). Mode-independence and ROLE-GUARD process-role teardown are roadmap, so non-sprint modes do not yet share the identical lifecycle guarantees.

---

## References / Absorbed

- **Absorbs:** ADR-025 (Graceful Shutdown Strategy — SIGINT → `interruptActiveSprint()` + `killAllSessions()`; `killAllWorkers()` companion).
- **Sibling lifecycle ADR (cross-ref, not merged):** ADR-G-025 (Process Resilience, Recovery & Live Observability — absorbed ADR-043 Brain Crash Recovery + ADR-044 State Observability).
- **Mode partner:** ADR-G-024 (Mode Architecture — mode-independent lifecycle).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — backend-agnostic worker kill).
- **Authority partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — ROLE-GUARD process-role teardown).
- **Born work-items:** MOAT-2 (ORPHAN-START-PROC — normal-completion coordinator lingers, MASTER-PLAN P0), SIGTERM-CLEANUP (wire the SIGTERM handler to the same interrupt/cleanup path as SIGINT).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 025 → ADR-G-013), `.analysis/hermes-vs-deckent-direction-decisions.md`.
