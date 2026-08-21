# ADR-G-013: Graceful Shutdown & Lifecycle

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=**SIGINT** handler (`entry.ts`; SIGTERM registered but runs no cleanup) → `interruptActiveSprint()` (task-level INTERRUPTED) + `killAllSessions()` (tmux) (`sprint-lifecycle.ts` · `tmux.ts`) + **normal-completion coordinator exit** (MOAT-2 ✅ 2026-07-01 — root cause = un-unref'd worker child handle; fix `child.unref()` + SIGTERM→SIGKILL escalation + timer-unref DiD; real-binary e2e proven) → tomorrow=mode-independent lifecycle + SIGTERM-CLEANUP + WORKER-PGID-TEARDOWN + ROLE-GUARD process-role teardown
**Status:** accepted (MOAT-2 ✅ 2026-07-01 — normal-completion linger root-caused [worker child handle, empirically verified] + subprocess fix landed, unit + real-binary-e2e proven; residuals WORKER-PGID-TEARDOWN [grandchild process-group] + SIGTERM-CLEANUP still open) · **Date:** 2026-06-30 (rev 2026-07-01) · **Absorbs:** ADR-025 (Graceful Shutdown Strategy) · **Supersedes:** —
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

- **ORPHAN-START-PROC fix (MOAT-2) — ✅ DONE (2026-07-01, subprocess backend; real-binary e2e proven):** the normal-completion linger (sprint-333 ~27min) was **root-caused, empirically**. The dominant loop-anchor is the **worker child process handle**, NOT a timer: a `child_process.spawn` without `detached`/`unref` keeps the parent's event loop alive until the child exits (Node: `child.unref()` "allow[s] the parent to exit independently of the child"), and the sprint keys completion on the `.result` FILE — so a worker that writes its result while its process lingers pins the coordinator for the child's whole lifetime (repro: same-stdio child ⇒ parent waits its full runtime; `child.unref()` ⇒ parent drains in ~3ms). The heartbeat `setInterval` was a *secondary* anchor. **Fix:** (1) PRIMARY — `child.unref()` after spawn (safe: the EXECUTE result-poll keeps the loop alive mid-sprint); (2) NO-ORPHAN — `killWithSignal` escalates a graceful SIGTERM→SIGKILL after a short unref'd grace, cleared on exit (mirrors docker's `docker stop --time`); (3) DEFENSE-IN-DEPTH — `.unref()` the heartbeat + kill-timeout timers + reap the interval in `kill()`; (4) sprint-controller `snapshotInterval` + the sprint's `scanInterval` unref'd (standalone `deckent audit` stays ref'd) + a debug-gated `process.getActiveResourcesInfo()` at `runSprint` exit as permanent "unref'd-handle audit" observability. **tmux** workers are detached (no coordinator child-handle); **docker** uses a `docker wait` child bounded by the container's `timeout $TIMEOUT` + cleanup docker-stop (same handle class — plausibly bounded, *not verified as a proven difference*). The finalize-time SIGTERM (334-003) remains a defence-in-depth layer, not superseded. **Proof (unit + real-binary):** `tests/providers/subprocess-moat2-linger.test.ts` (8 tests: `child.unref()` called + SIGKILL escalation + timer `hasRef()===false`) + two real-binary e2e smokes against the built `dist`: (a) a real `SubprocessSpawnBackend` with a live `sleep 12` worker → the coordinator process **exits in ~4ms** (`activeResources=[]`), no linger; (b) a SIGTERM-ignoring direct worker (pidfile-exact) is **SIGKILL-reaped in ~2s**, no orphan. **Honest residual (born):** the SIGKILL escalation kills the *direct* worker but NOT its grandchildren — a worker that spawns its own subprocess (e.g. claude's bash tool) can orphan the grandchild because we kill by single PID, not process group (`WORKER-PGID-TEARDOWN`, ROLE-GUARD-adjacent: spawn `detached` + `kill(-pid)`; docker already solves this via container isolation). A full `deckent start` real-sprint exit-smoke that rules out any OTHER coordinator handle (notify-dispatcher / connector) is observable via the `getActiveResourcesInfo` diagnostic. (MASTER-PLAN: MOAT-2 ✅, P0.)
- **Mode-independent lifecycle:** graceful shutdown is **uniform across every mode** (sprint | task | process | autonomous | flow — ADR-G-024 Mode Architecture), not sprint-specific; each mode tears down its own workers / sessions / locks the same way.
- **ROLE-GUARD process-role teardown:** shutdown respects **process roles** (ADR-G-020 / ROLE-GUARD — Brain/orchestrator vs worker) so the correct role coordinates teardown and no role-process is orphaned; worker kill is **backend-agnostic** (subprocess/docker/tmux/firecracker) via ADR-G-014.

---

## Consequences

**(+)** Ctrl+C always leaves a clean state — INTERRUPTED sprint, released locks, no orphan tmux sessions; the per-worker variant covers non-tmux backends; `deckent review` surfaces the interruption honestly rather than presenting a silent half-run.

**(−)** Today the clean teardown runs **on SIGINT only** (SIGTERM is registered but its handler does not run the cleanup — SIGTERM-CLEANUP); interrupt is **task-level** (per-task JSON, no sprint-state.json persist); backend-agnostic worker-kill flows through the SpawnBackend, not `killAllWorkers` (tmux-scoped). The **normal-completion coordinator linger is fixed** for the subprocess backend (MOAT-2 ✅ 2026-07-01 — root cause = the un-unref'd worker child handle [empirically verified], fixed by `child.unref()` + SIGTERM→SIGKILL escalation + timer-unref DiD; proven by unit tests + two real-binary e2e smokes [~4ms coordinator exit despite a live child; SIGKILL reap of a signal-ignoring worker]). Residual: grandchild process-group teardown [`WORKER-PGID-TEARDOWN`]. Mode-independence and ROLE-GUARD process-role teardown are roadmap, so non-sprint modes do not yet share the identical lifecycle guarantees.

---

## References / Absorbed

- **Absorbs:** ADR-025 (Graceful Shutdown Strategy — SIGINT → `interruptActiveSprint()` + `killAllSessions()`; `killAllWorkers()` companion).
- **Sibling lifecycle ADR (cross-ref, not merged):** ADR-G-025 (Process Resilience, Recovery & Live Observability — absorbed ADR-043 Brain Crash Recovery + ADR-044 State Observability).
- **Mode partner:** ADR-G-024 (Mode Architecture — mode-independent lifecycle).
- **Backend partner:** ADR-G-014 (Spawn Backend, Options & Observation — backend-agnostic worker kill).
- **Authority partner:** ADR-G-020 (Authority, Roles, Flow & Enforcement — ROLE-GUARD process-role teardown).
- **Born work-items:** MOAT-2 (ORPHAN-START-PROC — normal-completion coordinator linger, MASTER-PLAN P0 — ✅ **done 2026-07-01**: root cause = un-unref'd worker child handle [empirically verified, NOT the timer]; `child.unref()` + SIGTERM→SIGKILL escalation + heartbeat/kill-timeout/`snapshotInterval`/`scanInterval` unref'd DiD + `getActiveResourcesInfo` debug audit; unit + real-binary e2e proven), **WORKER-PGID-TEARDOWN** (born — SIGKILL reaps the direct worker but not its grandchildren; spawn `detached` + `kill(-pid)` for full process-group teardown; ROLE-GUARD-adjacent), SIGTERM-CLEANUP (✅ done 2026-07-02, sprint-350-005 — SIGTERM now runs the SAME interrupt+session-kill cleanup path as SIGINT in entry.ts onSignal; test proves shared path without real signals).
- **Direction:** `.analysis/adr-review-crosswalk.md` (row 025 → ADR-G-013); runtime lifecycle and recovery requirements in this ADR.
