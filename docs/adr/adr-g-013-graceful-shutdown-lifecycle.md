# ADR-G-013: Graceful Shutdown & Lifecycle

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=SIGINT handler (`entry.ts`) → `interruptActiveSprint()` + `killAllSessions()`/`killAllWorkers()` (`sprint-lifecycle.ts` · `tmux.ts`) + INTERRUPTED state → tomorrow=mode-independent lifecycle + ORPHAN-START-PROC fix (MOAT-2) + ROLE-GUARD process-role teardown
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
  <order>sprint-state save FIRST, then session kill.</order>
</sigint-shutdown>
```

**Result:** a clean state after Ctrl+C. The sprint is marked **INTERRUPTED** (`deckent review` surfaces it); workers receive SIGTERM and can mark their own `.hb` DONE; `deckent cleanup` leaves no orphan files.

**Companion:** `killAllWorkers()` (`tmux.ts:217`) — the per-worker variant of `killAllSessions()` (single worker, or `/api/kill/all`), which also covers the subprocess/docker backends, not only tmux.

---

## Intent / Roadmap (Tomorrow)

- **ORPHAN-START-PROC fix (MOAT-2):** a normal-completion coordinator process can **linger** (recurrence-flagged 🟠) — close the lifecycle so the coordinator always exits on completion, not only on SIGINT. This is a trust-moat: no orphan process survives a clean run. (MASTER-PLAN: MOAT-2, P0.)
- **Mode-independent lifecycle:** graceful shutdown is **uniform across every mode** (sprint | task | process | autonomous | flow — ADR-G-024 Mode Architecture), not sprint-specific; each mode tears down its own workers / sessions / locks the same way.
- **ROLE-GUARD process-role teardown:** shutdown respects **process roles** (ADR-G-020 / ROLE-GUARD — Brain/orchestrator vs worker) so the correct role coordinates teardown and no role-process is orphaned; worker kill is **backend-agnostic** (subprocess/docker/tmux/firecracker) via ADR-G-014.

---

## Consequences

**(+)** Ctrl+C always leaves a clean state — INTERRUPTED sprint, released locks, no orphan tmux sessions; the per-worker variant covers non-tmux backends; `deckent review` surfaces the interruption honestly rather than presenting a silent half-run.

**(−)** Today the clean teardown is reliable **on SIGINT**, but the **normal-completion path can still leave a lingering coordinator** (MOAT-2, open 🟠). Mode-independence and ROLE-GUARD process-role teardown are roadmap, so non-sprint modes do not yet share the identical lifecycle guarantees.

---

## References / Absorbed

- **Absorbs:** ADR-025 (Graceful Shutdown Strategy — SIGINT → `interruptActiveSprint()` + `killAllSessions()`; `killAllWorkers()` companion).
- **Sibling lifecycle ADR (cross-ref, not merged):** ADR-G-025 (Process Resilience, Recovery & Live Observability — absorbed ADR-043 Brain Crash Recovery + ADR-044 State Observability).
- **Mode partner:** ADR-G-024 (Mode Architecture — mode-independent lifecycle).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — backend-agnostic worker kill).
- **Authority partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — ROLE-GUARD process-role teardown).
- **Born work-items:** MOAT-2 (ORPHAN-START-PROC — normal-completion coordinator lingers, MASTER-PLAN P0).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 025 → ADR-G-013), `.analysis/hermes-vs-deckent-direction-decisions.md`.
