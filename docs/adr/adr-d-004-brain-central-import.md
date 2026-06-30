# ADR-D-004: Brain Central Import — One-Way Dependency

**Class:** ADR-D (Dogfooding / Dev) · **Scope:** dev · **Immutable:** no · **Source:** publisher+contributor · **Enforcement:** today=`authority-enforcer.ts` ADR-008 check + `core/ → orchestra/` import-direction scan (advisory/soft per ADR-G-020 V1.0 — warns + emits, does not hard-block) → tomorrow=LAYER-1 inversion cleanup (residual violations) + hard-flip under the ADR-G-020 enforcement-engine
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-008 (Brain Merkezi Import — Tek Yönlü Bağımlılık) · **Supersedes:** —
**Crosswalk:** ADR-008 → ADR-D-004 (role-separation split out → ADR-G-020)

> **Scope note:** This ADR is about **import direction / code hygiene only**. The "Brain orchestrates but never authors code" *role-separation* concern was separated out during the 2026-06-30 review and now lives in **ADR-G-020** (Authority Matrix, Rule-4 / ROLE-GUARD). Do not put role-separation here — this is purely the module-dependency-direction convention.

---

## Context

Cyclic imports produce undefined behavior in Node.js ESM. Deckent's layering avoids cycles by keeping a strict one-way dependency direction: the orchestration (Brain) layer imports the lower layers; the lower layers never import upward. The original ADR-008 stated this as "Brain is the only module that imports tmux/auditor/worker," verified by a `from.*brain` grep.

That phrasing aged in two ways. First, the god-object split (ADR-D-006, ex-024/026) deliberately broke the monolithic Brain into many `sprint-*` organs — so "the only importer" is no longer a single file. Second, the *real* enforced invariant turned out to be broader and more precise than the original grep, and code drift left a handful of genuine inversions. This record restates the rule against today's module map and lists the residual violations as cleanup work.

---

## Decision (Today)

### 1. The enforced invariant — `core/` must not import `orchestra/`

The live lint (`src/orchestra/authority-enforcer.ts`, ADR-008 check) scans the **import direction `core/ → orchestra/`**: `core/` must not depend on `orchestra/`. This is broader and more accurate than the original `from.*brain` grep. Per ADR-G-020 V1.0 the check is **advisory/soft** — it warns and emits an audit signal, it does not hard-block.

### 2. The "Brain-family" — who may import tmux/auditor/worker

The Sprint-281 amendment defined the family precisely, since the split organs are *not* violations:

> **Brain-family** = `sprint-controller` + its extracted phase/helper organs (`sprint-phases`, `sprint-spawner`, `sprint-lifecycle`, `sprint-planner`, `sprint-finalizer`, `sprint-utils`, `result-collector`, `result-evaluator`, `debt-manager`, `resource-monitor`) + the spawn abstraction (`spawn-backend`, `spawn-backend-docker`) + the thin re-export shims (`brain.ts` / `index.ts`).

Only the Brain-family may import `tmux` / `auditor` / `worker`. Family-external orchestra modules, `cli/`, `api/`, and `mcp/` must not import those three directly. The one-way principle is invariant: **tmux/auditor/worker never import brain; `core/` never imports any upper layer.**

### 3. Sanctioned exceptions + a resolved cycle

- **Provider CLI-spawn adapters** (`src/providers/claude.ts` → `orchestra/tmux.js` for `killWorker`/`listWorkers`/`ensureSession`/…) are **not** violations: per ADR-G-008 + ADR-027→ADR-G-014, a CLI-spawn adapter legitimately wraps the tmux/spawn-backend arm. Rule: provider adapters may wrap tmux/spawn-backend; they may **never** import auditor/worker; the one-way direction still holds.
- **Resolved cycle (Sprint 279):** the `core/audit-writer` + `core/audit-query` → `orchestra/event-stream` cycle was fixed by **moving `event-stream` into `core/`** (`src/core/event-stream.ts`); `orchestra/event-stream.ts` is now a re-export shim.

---

## Intent / Roadmap (Tomorrow)

**LAYER-1 inversion cleanup** — the advisory enforcement let several genuine inversions persist; each is a tracked work-item:

- **ADR-008-W:** `src/core/routing-engine.ts:30` imports `analyzeSkillInMemory` from `../orchestra/ecosystem-intelligence.js` — the one remaining `core/ → orchestra/` import. Fix: move the consumed function/module into `core/`, or invert the dependency.
- **ORCH-W1 (reverse-direction leak):** `task-mode-runner.ts → cli/commands/run + spawn` — a ~302-LoC `spawnWorkerMultiProvider` lives in CLI and orchestra depends on it; move the spawn logic into orchestra and make CLI a thin wrapper. Also `sprint-finalizer` / `sprint-phases → cli/helpers` (presentation/splash) imports.
- **CORE-W1:** `directive-interrogator.ts:18` — a second `core/ → cli/` violation.
- **API-W1:** the systemic `api/ → cli/` inversion (business logic lives in core/orchestra; cli/api/mcp are thin surfaces).

When ADR-G-020's enforcement-engine graduates (ADR-094 flag-gated vein → default-on), this advisory import check can **hard-flip** to a blocking gate.

---

## Consequences

**(+)** Clean, cycle-free one-way layering; a precise, code-verified statement of which modules may import the orchestration internals; thin cli/api/mcp surfaces with business logic concentrated in core/orchestra; the god-object split is reconciled with the rule (its organs are family members, not violations).

**(−)** Advisory/soft enforcement (ADR-G-020 V1.0) allowed real inversions to accrue — four open cleanup items (ADR-008-W, ORCH-W1, CORE-W1, API-W1). Until the G-020 enforcement-engine hard-flips, the invariant is documentation + warn-level signal, not a blocking gate.

---

## References / Absorbed

- **Absorbs:** ADR-008 (one-way import direction; Brain-family definition; sanctioned provider-adapter exception; Sprint-279 event-stream cycle-fix).
- **Split out:** role-separation ("Brain never authors code") → **ADR-G-020** (Authority Matrix Rule-4 / ROLE-GUARD).
- **Cross-ref:** ADR-D-006 (the god-object split created the Brain-family organs), ADR-G-014 (Spawn Backend — provider-adapter wrapping), ADR-G-008 (provider adapters), ADR-027→ADR-G-014 (hybrid spawn), ADR-G-019 (ADR-D contributor convention under the taxonomy).
- **Born work-items:** ADR-008-W, ORCH-W1, CORE-W1, API-W1 (LAYER-1 inversion cleanup). The canonical refined statement of these import rules also lives in `CLAUDE.md` and `docs/reference/api-surface.md` (Module Import Rules).
