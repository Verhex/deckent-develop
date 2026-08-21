# ADR-D-006: Code Architecture Conventions

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=`register<Name>` command convention (+2 registered exceptions) + cohesion-based module boundaries + 4-tier dead-code disposition policy (advisory, design-pass) → tomorrow=GODOBJ cohesion re-split (MOD-SPLIT) + dead-code dormant-sweep (DEADMOD / DORMANT-3) + CLI-CONV-CLEANUP
**Status:** accepted (provisional — DEADMOD + GODOBJ follow-up required: dead-code seed/markers + controller regrowth) · **Date:** 2026-06-30 · **Absorbs:** ADR-012 (register pattern), ADR-024 (sprint-controller god-object split), ADR-026 (god-object split strategy), ADR-038 (Dead Code Disposition — **policy only**; Sprint-139 module list archived) · **Supersedes:** —
**Crosswalk:** ADR-012 + ADR-024 + ADR-026 + ADR-038-policy → ADR-D-006

> **Scope note:** Contributor-only code-structure conventions (how deckent's source is organized) — ADR-D, dev install. ADR-038 is folded **as durable policy only**; its Sprint-139-specific audit/module list is archived as a historical record, not part of this convention.

---

## Context

Deckent's source is held together by a few durable structural conventions. As the codebase grew, three recurring concerns were captured piecemeal across four ADRs: command registration consistency (ADR-012), god-object growth (ADR-024 sprint-controller split, ADR-026 phased split strategy), and dead-code accumulation (ADR-038 disposition audit). The point-in-time figures in those records drifted badly (orchestra module counts, controller LoC) and the Sprint-139 audit's specific module list is now historical.

This ADR consolidates the **durable conventions** and discards the snapshots. Crucially, the 2026-06-30 review corrected the god-object framing: the boundary is **functional cohesion / correct responsibility**, **not a line-count dogma** — a long but cohesive module can be valid; a mixed-responsibility module is the defect.

---

## Decision (Today)

### 1. `register<Name>(program)` command pattern

Each CLI command lives in its own file under `src/cli/commands/` and exports `register<Name>(program: Command): void`. The entry point (`src/cli/index.ts`) calls one `register<Name>(program)` per command. Adding a command = new file + import + `register` call. Independent files give independent test + easy add/remove. (Command/file counts are drift-prone and are **not** pinned here — canonical list in the auto-generated `docs/reference/cli.md`; cross-check `grep -c 'register[A-Z][A-Za-z]*(program' src/cli/index.ts`.)

**Registered exceptions (tracked → CLI-CONV-CLEANUP):**
- **`cost.ts` exports `registerCostCommand`** (not the bare `registerCost` the convention implies) — a naming drift; normalize to `registerCost` or accept the suffix as the pattern.
- **`skill-marketplace` registers as a *subcommand*** via `registerSkillMarketplace()` called *inside* `skill.ts` (so `skill publish` nests under `skill`), not as a top-level `index.ts` call — an intentional command-nesting, not a violation, but it deviates from "one `register` per command in `index.ts`" and must be documented as such.
- The `tests/cli/index.test.ts` `registers all 28 command functions` assertion pins a **drift-prone count** (against §1's own "counts are not pinned") — de-hardcode it to the live `grep` count.

### 2. Cohesion-based module boundaries — NOT a LoC dogma

Modules split on **functional cohesion / correct responsibility boundary**, not on line count. **A long file is acceptable; a mixed-responsibility file is the defect.** The god-object split is the canonical application:

- `brain.ts` was split (Sprint 036), then `sprint-controller.ts` (which re-grew) was split in phases — **Faz 1** `sprint-phases.ts` (the 7 phase functions `runPlanPhase`…`runCleanupPhase`, all still live under their original names), **Faz 2** `sprint-utils.ts`, **Faz 3** `result-collector.ts` (`waitForResults` + IPC/fs.watch). The `sprint-*` module family grew *alongside* the phase functions, not by renaming them.
- **Safe intra-orchestra cycle (documented):** `sprint-phases.ts` ↔ `sprint-controller.ts` form an *intentional* circular dependency. It is **safe by construction** because every cross-usage is **inside a function body** (deferred evaluation) — so no read-before-eval TDZ `ReferenceError` (the cyclic-imports rationale of ADR-D-004). This is an *intra-layer* cycle (both are Brain-family in `orchestra/`), **not** a forbidden Layer-1 cross-layer cycle. Recorded here so the boundary claim stays honest.
- Backward compatibility is preserved by **thin re-export coordinators** (`brain.ts` ~53-line "Slim Re-export Layer").
- **Maintenance flag (honest):** `sprint-controller.ts` re-grew to **~1609 LoC** after a Sprint-136 slim to 209 LoC — and its *own header* still claims "Thin Orchestration Layer / only `runSprint`/`waitForResults`/`evaluateResultSync` remain," which is itself stale (lifecycle-glue, checkpoint, heartbeat/monitor, grace-kill, snapshot/pid-cleanup still live in it). The split *decision* stands (controller still imports its phases; coordinators stay thin) but size-discipline was not self-sustaining — boundary correctness, not size, is the rule, and the regrowth + the stale header fold into the GODOBJ re-split (below).
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

- **GODOBJ — cohesion re-split:** re-split the re-grown `sprint-controller.ts` (~1609 LoC) on cohesion lines + fix its stale "Thin" header. Concrete extraction candidates (cohesive responsibilities currently glued into the controller): **checkpoint** persistence · **heartbeat / monitor** · **grace-kill / liveness** · **snapshot / pid-cleanup**. Folded into the **MOD-SPLIT** module-boundary inventory (community↔enterprise layer map). This record carries it.
- **DEADMOD / DORMANT-3 — dormant-sweep + audit-seed cleanup:** apply the §3 disposition policy to the known dormant set:
  - **`batch-stats.ts` is already removed** — but the stale references must be cleaned: `scripts/dead-code-audit.mjs:92` still seeds it (and this ADR previously claimed it "unremoved").
  - **`brain-context.ts` + `multi-agent.ts`** — 0-real-caller dormant but **carry no Defer marker** (policy violation): decide per-module → mark `@deprecated` + `// DEFERRED` (Defer tier) or Remove.
  - **`decision-replay.ts`** — already marked (`@deprecated Since Sprint 066, Part of V1 routing`); it is a **V1-routing module → removed by ROUTE-V1-PURGE** (ADR-028 → ADR-G-006), not indefinitely deferred.
  Folds into the post-migration dormant-sweep ([[project_clean_repo_migration_and_training_data]]: "re-run the dormant scan once the work settles").
- **CLI-CONV-CLEANUP:** normalize `registerCostCommand`, document the `skill-marketplace` subcommand nesting as a sanctioned exception, and de-hardcode the `index.test.ts` command-count.

---

## Consequences

**(+)** Durable conventions survive while drift-prone snapshots are dropped; the cohesion-not-LoC boundary prevents both god-objects *and* pointless file-shattering; the disposition policy preserves architectural knowledge with explicit rollback; the safe intra-orchestra cycle is now documented (honest boundary); the modular boundaries seed MOD-SPLIT.

**(−)** Cohesion is a judgment call with no mechanical gate — the controller regrowth (1609 LoC) + its stale "Thin" header prove size-discipline is not self-sustaining. The dormant-sweep is deferred, so several known 0-caller modules (`brain-context`, `multi-agent`) linger unmarked, and a removed module (`batch-stats`) still has a stale audit-seed. The register convention has two unmanaged exceptions. **Provisional until DEADMOD + GODOBJ + CLI-CONV-CLEANUP land.**

---

## References / Absorbed

- **Absorbs:** ADR-012 (register pattern), ADR-024 (sprint-controller → sprint-phases split, Faz-1), ADR-026 (phased god-object split, Faz 1-3). **Folds policy from** ADR-038 (4-tier disposition + rollback + design-pass-not-mechanical-delete) — its Sprint-139 audit/module list is **archived** (historical record, not active convention).
- **Cross-ref:** ADR-D-004 (the split created the Brain-family organs the one-way-import rule names; the safe intra-orchestra cycle uses D-004's TDZ-safe-in-function-body rationale), ADR-G-016 (Product Vision / MOD-SPLIT — community↔enterprise = governance/audit depth, not feature-gating), ADR-D-008 (repo strategy / MODULARIZE), ADR-G-019 (ADR-D convention under the taxonomy).
- **Born work-items:** GODOBJ (cohesion re-split + controller-header-fix; candidates: checkpoint/heartbeat-monitor/grace-kill-liveness/snapshot-pid-cleanup) · DEADMOD / DORMANT-3 (dormant-sweep + `batch-stats` audit-seed cleanup + `brain-context`/`multi-agent` marker-or-remove decision) · CLI-CONV-CLEANUP (`registerCostCommand` normalize + `skill-marketplace` exception-doc + `index.test` count de-hardcode).

> **Note:** ADR-038's Kademe-3 "deprecate/protect" tier protected the ADR-028 V1 decision-engine modules (incl. `decision-replay.ts`). That protection is superseded by the routing-V1 purge decision (ROUTE-V1-PURGE, ADR-028 → ADR-G-006) — the V1 modules are slated for **full removal**, not indefinite protection.
