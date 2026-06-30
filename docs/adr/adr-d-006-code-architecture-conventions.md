# ADR-D-006: Code Architecture Conventions

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=`register<Name>` command convention + cohesion-based module boundaries + 4-tier dead-code disposition policy (advisory, design-pass) → tomorrow=GODOBJ cohesion re-split (MOD-SPLIT) + dead-code dormant-sweep (DEADMOD / DORMANT-3)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-012 (register pattern), ADR-024 (sprint-controller god-object split), ADR-026 (god-object split strategy), ADR-038 (Dead Code Disposition — **policy only**; Sprint-139 module list archived) · **Supersedes:** —
**Crosswalk:** ADR-012 + ADR-024 + ADR-026 + ADR-038-policy → ADR-D-006

> **Scope note:** Contributor-only code-structure conventions (how deckent's source is organized) — ADR-D, dev install. ADR-038 is folded **as durable policy only**; its Sprint-139-specific audit/module list is archived as a historical record, not part of this convention.

---

## Context

Deckent's source is held together by a few durable structural conventions. As the codebase grew, three recurring concerns were captured piecemeal across four ADRs: command registration consistency (ADR-012), god-object growth (ADR-024 sprint-controller split, ADR-026 phased split strategy), and dead-code accumulation (ADR-038 disposition audit). The point-in-time figures in those records drifted badly (orchestra module counts, controller LoC) and the Sprint-139 audit's specific module list is now historical.

This ADR consolidates the **durable conventions** and discards the snapshots. Crucially, the 2026-06-30 review corrected the god-object framing: the boundary is **functional cohesion / correct responsibility**, **not a line-count dogma** — Hermes runs 15-18K-LOC files fine; a long file is not the problem, a *mixed-responsibility* file is.

---

## Decision (Today)

### 1. `register<Name>(program)` command pattern

Each CLI command lives in its own file under `src/cli/commands/` and exports `register<Name>(program: Command): void`. The entry point (`src/cli/index.ts`) calls one `register<Name>(program)` per command. Adding a command = new file + import + `register` call. Independent files give independent test + easy add/remove. (Command/file counts are drift-prone and are **not** pinned here — canonical list in the auto-generated `docs/reference/cli.md`; cross-check `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts`.)

### 2. Cohesion-based module boundaries — NOT a LoC dogma

Modules split on **functional cohesion / correct responsibility boundary**, not on line count. **A long file is acceptable; a mixed-responsibility file is the defect.** The god-object split is the canonical application:

- `brain.ts` was split (Sprint 036), then `sprint-controller.ts` (which re-grew) was split in phases — **Faz 1** `sprint-phases.ts` (the 7 phase functions `runPlanPhase`…`runCleanupPhase`, all still live under their original names), **Faz 2** `sprint-utils.ts`, **Faz 3** `result-collector.ts` (`waitForResults` + IPC/fs.watch). The `sprint-*` module family grew *alongside* the phase functions, not by renaming them.
- Backward compatibility is preserved by **thin re-export coordinators** (`brain.ts` ~53-line "Slim Re-export Layer").
- **Maintenance flag (honest):** `sprint-controller.ts` re-grew to ~1513 LoC after a Sprint-136 slim to 209 LoC. The split *decision* stands (controller still imports its phases; coordinators stay thin) but size-discipline was not self-sustaining — boundary correctness, not size, is the rule, and the regrowth is folded into the GODOBJ re-split (below).
- These clean module boundaries are the **modular foundation MOD-SPLIT** (same codebase + license-loadable enterprise layer; ADR-G-016) builds on.

### 3. Dead-code disposition policy — 4-tier, design-pass, with rollback

Dead/dormant code is disposed of by a **design pass, not a mechanical delete** (removing value-bearing architectural knowledge is itself a cost). Every disposition picks one of four tiers and records rationale + rollback:

| Tier | When | Action | Rollback |
|------|------|--------|----------|
| **Remove** | genuinely valueless, 0-caller, cheaply re-derivable | delete source + tests | `git revert` single commit (record the pre-delete hash) |
| **Defer** | tied to a named roadmap item | keep + `@deprecated` JSDoc + `// DEFERRED: reassess <milestone>` marker | remove the marker, wire it in |
| **Deprecate / protect** | kept as reference under a governing ADR | keep; status change requires that ADR's amendment | N/A |
| **False-positive** | "0-caller" report is wrong (actively imported) | correct the audit, keep the module | N/A |

---

## Intent / Roadmap (Tomorrow)

- **GODOBJ — cohesion re-split:** re-split the re-grown coordinators (`sprint-controller.ts` regrowth) on cohesion lines, folded into the **MOD-SPLIT** module-boundary inventory (community↔enterprise layer map). No separate work-item — this record carries it.
- **DEADMOD / DORMANT-3 — dormant-sweep:** the deferred dead-code sweep — e.g. `batch-stats.ts` (still unremoved, 0-caller), `brain-context.ts` / `decision-replay.ts` / `multi-agent.ts` (0-production-caller dormant) — folds into the post-migration dormant-audit sweep ([[project_clean_repo_migration_and_training_data]]: "re-run the dormant scan once the work settles"). No separate urgent item.

---

## Consequences

**(+)** Durable conventions survive while drift-prone snapshots are dropped; the cohesion-not-LoC boundary prevents both god-objects *and* pointless file-shattering; the disposition policy preserves architectural knowledge with explicit rollback; the modular boundaries seed MOD-SPLIT.

**(−)** Cohesion is a judgment call with no mechanical gate — the controller regrowth proves size-discipline is not self-sustaining. The dormant-sweep is deferred, so several known 0-caller modules linger with maintenance cost (tsc time, IDE noise, contributor confusion).

---

## References / Absorbed

- **Absorbs:** ADR-012 (register pattern), ADR-024 (sprint-controller → sprint-phases split, Faz-1), ADR-026 (phased god-object split, Faz 1-3). **Folds policy from** ADR-038 (4-tier disposition + rollback + design-pass-not-mechanical-delete) — its Sprint-139 audit/module list is **archived** (historical record, not active convention).
- **Cross-ref:** ADR-D-004 (the split created the Brain-family organs the one-way-import rule names), ADR-G-016 (Product Vision / MOD-SPLIT — community↔enterprise = governance/audit depth, not feature-gating), ADR-065 → ADR-D-008 (repo strategy / MODULARIZE), ADR-G-019 (ADR-D convention under the taxonomy).
- **Born work-items:** GODOBJ (cohesion re-split, MOD-SPLIT), DEADMOD / DORMANT-3 (dormant-audit sweep).

> **Note:** ADR-038's Kademe-3 "deprecate/protect" tier protected the ADR-028 V1 decision-engine modules. That protection is superseded by the routing-V1 purge decision (ROUTE-V1-PURGE, ADR-028 → ADR-G-006) — the V1 modules are slated for **full removal**, not indefinite protection.
