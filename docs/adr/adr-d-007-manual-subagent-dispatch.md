# ADR-D-007: Manual Subagent Dispatch (Dogfood Survival-Fallback)

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=Alperen review-gate (`git diff --stat` per subagent) + worktree isolation + TDD skip-count baseline (manual, dogfood-only) → tomorrow=parity with Brain-autonomous primary; this protocol stays as the last-resort
**Status:** accepted (survival-fallback — documented parity-gaps in Roadmap) · **Date:** 2026-06-30 · **Absorbs:** ADR-047 (Manuel Subagent Dispatch Protocol) · **Supersedes:** —
**Crosswalk:** ADR-047 → ADR-D-007 (Brain-Death automated *procedure* split out → ADR-G-025)

> **Role note (2026-06-30 reframe):** This protocol is **demoted from "primary operating mode" → "survival-fallback."** Brain-autonomous orchestration (`deckent plan --structured && deckent start`) is the primary path (live since ~Sprint 270). This manual, human-guided worktree-repair protocol is the **last resort** — when Brain is broken/unreliable or the autonomous flow deadlocks (it was used in Sprint 280). The *automated* Brain-DEATH recovery PROCEDURE (provider-failover / retry / `finalize --force`) is **not** here — it lives in **ADR-G-025**. ADR-D-007 is only the dogfood manual repair protocol.

---

## Context

Sprint 164-168 hit a chicken-and-egg paradox: Brain's orchestration pipeline was partly broken, and a broken Brain cannot autonomously repair itself (you can't plan/dispatch through the pipeline you're trying to fix). The escape was **human-guided (Alperen-guided) manual subagent dispatch** — and it worked: across 23+ incidents (Sprints 164-168) it delivered **zero sprint abandonment**. In Sprint 168 the organically-grown survival pattern was hardened into a formal, repeatable protocol (8 parallel + 1 sequential subagents under git-worktree isolation, dual-eval-gated).

Since ~Sprint 270 the operating reality inverted: deckent-dev runs **Brain-autonomous** (the autonomous dogfood loop *is* `deckent plan --structured && deckent start` — Sprints 277-280 ran that way). So this protocol is no longer the primary mode; its role is **survival-fallback**, and this ADR records it as such.

---

## Decision (Today)

The hardened manual subagent dispatch protocol (dogfood survival-fallback) rests on seven principles:

1. **Worktree isolation** — `git worktree add ../deckent-sprint-NNN-<CLUSTER>` per cluster/subagent. Parallel subagents cannot collide; each works in its own worktree and never touches `main` until the end-of-sprint rebase + merge cascade.
2. **File authority matrix** — a STRICT `scope.filesWrite` per subagent; the matrix **cannot be widened** (a new subagent gets a new row; an existing row is never grown). Enforced by the Alperen review gate via `git diff --stat`; out-of-scope write → subagent retry. (ADR-G-020 RBAC, manual-dispatch form.)
3. **Wave structure (cascade-reverse)** — dispatch the **cascade endpoint** (the most-depended-on module) **first**, so upstream fixes build on an already-clean base instead of multiplying a bad contract downstream.
4. **Wave 1.5 serial gate** — a human-in-the-loop (Alperen) checkpoint after the cascade-endpoint fix + any critical-contract write, before downstream waves base their work on it.
5. **TDD enforcement gate** — failing-test-first → minimal implementation → pass → atomic commit per cycle; **adding `skip` is forbidden** (baseline skip count preserved); the subagent `.result` must carry `tests_skipped_added: 0`, and the review gate verifies the skip-count delta.
6. **Lock pattern** — a dispatch lock file (`.deckent/sprint-NNN-dispatch-locks.json`) tracks each subagent `pending → active → done → merged`; shared files (e.g. `sprint-finalizer.ts`) use a **sequential lock** (next subagent can't go `active` until the prior is `done`).
7. **Manual survival fallback** — when Brain orchestration is NO_GO/unreliable, the **Sprint N+0.5 replay** pattern runs manual dispatch: the failed cluster becomes Sprint N+0.5's first task, worktree isolation is re-established, and fixes are **persistent** (no regression). **Catch-22 prevention:** Sprint N+0.5 can *always* start, even with a broken Brain — `Sprint N NO_GO → Sprint N+0.5 BLOCKED` is forbidden.

---

## Intent / Roadmap (Tomorrow)

Brain-autonomous remains the primary path; the seven principles have **reached parity with documented gaps** (the **Gap / caveat** column below) — enough that this protocol is now a fallback rather than the default, but the gaps are exactly why it retains real safety value (above all the still-open WORKTREE-MERGE-RACE):

| ADR-D-007 principle | Brain-autonomous parity (today) | Gap / caveat (code-grounded) |
|---|---|---|
| Worktree isolation | spawn-time isolation | **MOAT-1 WORKTREE-MERGE-RACE (P0, open 🔴): the autonomous merge dropped 3/11 source-merges at 8-wide — manual worktree isolation is still strictly safer.** |
| File authority matrix | `scope.filesWrite` + auditor (ADR-G-020 V1.0) | **Enforcement is uneven: the agentic worker *hard-rejects* out-of-scope write/edit (`scope-guard.ts`); tmux/legacy spawn is *advisory* (auditor `git diff --stat`, warn-not-block). Uniformity tracked as TOOL-SCOPE.** |
| TDD / eval gate | Brain GO/NO_GO + CC disk-verify close-out | **`tests_skipped_added:0` is a MANUAL review-gate only — the auditor gates on fail-delta (`delta.fail>0`), not skip-delta. Not yet an automatic Brain gate (skip-gate-decision).** |
| Wave structure | `dependency_pipeline_enabled=true` (live multi-wave) | Live (config `true`). ⚠ `docs/guide/config-recovery.md` still pushes the legacy `false` — user-facing drift (CONFIG-RECOVERY-FIX). |
| Wave 1.5 serial gate | `deckent_checkpoint` + human-approved sprint-start | **CLI vs MCP diverge: MCP rejects re-decide of a non-pending checkpoint; the CLI helper writes status unconditionally (CHECKPOINT-PARITY).** |
| Lock pattern | `.locks/` + spawn-time lock | parity |
| Manual survival fallback | `deckent recover` / `deckent run` + CC manual intervention | parity — Principle-7 is permanent value (used in Sprint 280) |

This ADR stays **accepted (deliberately not deprecated):** Principle-7 (Manual Survival Fallback) carries permanent value and **was actually used in Sprint 280** (worker-timeout deadlock → `TaskStop` + manual sprint-state finalize + hand-corrections). The *automated* Brain-DEATH procedure — provider-failover (Claude → OpenAI/Codex, lossless), escalation (autonomous → approved-retry → kill), and the `finalize --force` trigger — is the forward surface and lives in **ADR-G-025** (BRAIN-DEATH-PROCEDURE work-item; see [[feedback_finalize_force_orphan_state]]).

---

## Consequences

**(+)** Zero sprint abandonment across 23+ repair incidents; a documented, repeatable last-resort that Alperen and Brain don't have to re-invent under pressure; worktree isolation makes parallel repair safe (8 subagents, no conflict — Sprint 168 dogfood proof); the TDD gate prevents regression (baseline skip count held).

**(−)** Human-intensive — the review gate requires manual approval per subagent and the Wave 1.5 serial gate adds time. Worktree management is overhead (9 worktrees + cleanup; forgotten worktrees consume disk). And it is now *only* a fallback — the primary path is Brain-autonomous, so this protocol is exercised rarely and must be kept current against drift. **Parity is real but not complete: the Roadmap table documents five gaps** — the open WORKTREE-MERGE-RACE (MOAT-1), uneven scope-enforcement (agentic-hard vs tmux-advisory), a manual-only skip-gate, CLI/MCP checkpoint divergence, and a `config-recovery.md` doc still pushing the legacy flag.

---

## References / Absorbed

- **Absorbs:** ADR-047 (Manuel Subagent Dispatch Protocol — 7 principles + Sprint-168 hardening + Sprint-281 role reframe to survival-fallback).
- **Split out:** the automated Brain-DEATH recovery **procedure** (failover / retry / `finalize --force`) → **ADR-G-025** (Process Resilience, Recovery & Live Observability).
- **Cross-ref:** ADR-G-020 (Authority Matrix — file-authority / RBAC; the manual review gate is its dogfood form), ADR-G-014 (Spawn Backend, Options & Observation — worktree/spawn isolation), ADR-G-026 (Dependency-Wave Execution — `dependency_pipeline_enabled`), ADR-G-018 (Verification Protocol — the `.result` contract), ADR-046 → ADR-G-015 (finalize hook chain), ADR-G-019 (ADR-D convention under the taxonomy).
- **Born work-items:** BRAIN-DEATH-PROCEDURE (ADR-G-025 + this ADR), tied to [[feedback_finalize_force_orphan_state]] · **CONFIG-RECOVERY-FIX** (`config-recovery.md` `dependency_pipeline_enabled=false` → document as legacy/fallback, not the default) · **CHECKPOINT-PARITY** (CLI add the MCP pending-guard, or declare MCP the canonical checkpoint surface) · **skip-gate-decision** (`tests_skipped_added` — keep manual-only and say so, or wire skip-delta into the auditor gate) · scope-enforcement uniformity → **TOOL-SCOPE**.
