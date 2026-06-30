# ADR-G-021: Self-Modifying Detection — Dogfood ↔ User-Project Discrimination

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** runtime detection + rollback-guard (protects deckent's own git tree)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-039 (Self-Modifying Task Detection)
**Crosswalk:** ADR-039 → ADR-G-021

> **Note (Alperen, 2026-06-30):** "Bu ADR'de düzenlenmeli — kodumuz buna dayanıyor; gayet detaylı ve düzgün ele alacağız." This is a safety law the codebase depends on; it must be handled in detail and correctly.

---

## Context

deckent runs in two fundamentally different modes: **dogfood** (deckent modifying its OWN source — runtime cache invalidation, MCP-restart, tsc-rebuild matter) and **user-project** (deckent orchestrating a user's Rails/React/Go/… project — the user's code never affects deckent's runtime). Conflating them caused the Sprint-138 Layer-4 class of failure (Brain ran stale pre-build cache after a worker rewrote `src/orchestra/`). ADR-039 formalized detection; the 2026-06-30 review elevates it to a global safety law and connects it to global-install discrimination + ROLE-GUARD.

---

## Decision (Today)

```xml
<self-modify-detection>
  <detect>detectDeckentRepo(root) = `.deckent/` exists AND package.json name === 'deckent'
    (both required; the name is the exact discriminator). isSelfModifying(task) =
    detectDeckentRepo AND task scope touches a deckent source pattern (src/core, src/orchestra,
    src/agents, src/cli, src/mcp, src/providers, src/api, src/monitor, src/dashboard,
    .deckent/agents, .deckent/skills).</detect>
  <policy>
    P1 self-modifying tasks run SEQUENTIAL (parallel tsc-rebuild race avoided).
    P2 self-modifying process → Wave-0 `tsc && vitest` health gate (design).
    P3 post-task auto-checkpoint (MCP-restart resume).
    P4 USER PROJECTS = NO-OP (detectDeckentRepo=false → zero overhead).
  </policy>
  <live-value>the proven, live consumer is the ROLLBACK-GUARD: detectDeckentRepo gates
    rollback.ts so deckent never `reset --hard`s its own git tree (self-git-mutation
    protection). P1–P3 are largely dormant; in practice deckent-dev self-modifying runs
    go through the manual dispatch path (ADR-D-007).</live-value>
</self-modify-detection>
```

---

## Intent / Roadmap (Tomorrow)

- **P1–P3 wire OR formalize-the-reality:** either wire the sequential-wave / Wave-0-gate / auto-checkpoint, OR formally adopt the ADR-D-007 manual-dispatch reality as the dogfood self-modify path (no silent dormancy).
- **Global-install discrimination:** with deckent installed **globally** and used across N user projects, the "deckent's own repo ↔ every user project" discrimination becomes critical (the detector must be robust per-project).
- **Merge with ROLE-GUARD** (ADR-G-020): the self-protection (don't mutate deckent's own code/git) and the Brain-never-codes boundary are the same self-protection family — pid/role + repo-detection enforced together at the tool layer.

---

## Consequences

**(+)** deckent protects its own source/git during dogfood and imposes zero overhead on user projects (P4 no-op). The rollback-guard is a real, working defense against self-git-mutation. The discrimination scales to global-install + many user projects.

**(−)** P1–P3 are dormant (the automated sequential-wave/checkpoint didn't land; manual-dispatch covers it) — born work-item to wire-or-formalize. `package.json name` is a heuristic (a fork could rename — accepted edge case). ROLE-GUARD pid/process enforcement is roadmap.

---

## References / Absorbed

- **Absorbs:** ADR-039.
- **Cross-ref:** ADR-G-020 (ROLE-GUARD / authority) · ADR-D-007 (manual dispatch — the live dogfood path) · ADR-G-017 (multi-project isolation) · ADR-G-025 (self-modify + rebuild/restart on crash-recovery).
- **Born / MASTER-PLAN:** ROLE-GUARD · P1-P3-wire-or-formalize · global-install-discrimination.
- **Memory:** `project_deckent_self_git_mutation_bug`.
