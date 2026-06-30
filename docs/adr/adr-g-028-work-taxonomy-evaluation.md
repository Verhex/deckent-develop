# ADR-G-028: Work Taxonomy (TaskKind × TechStack) & Evaluation

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** today=gaming-proof (Object.freeze registries; scope-shape detection, not title/description) + EffectClass→policy-gate (WM-6 PARK for risky classes) → tomorrow=EffectClass→runtime ApprovalBroker (critical-irreversible) + expanded TaskKind set + user-custom kinds (ADR-UG/UP)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-053 (TaskType Taxonomy) + ADR-055 (Hybrid Scoring 5-Layer Pipeline)
**Crosswalk:** 053 (+055) → ADR-G-028

> **Note (Alperen, 2026-06-30):** We advanced the TaskKind/EffectClass concepts a lot — we should add MORE types here; the core 3 are too narrow.

---

## Context

deckent must know *what kind* of work a task is, to judge it correctly and gate it safely. ADR-053 defined 3 TaskTypes (audit / document-write / code-development) with scope-shape detection + an EffectClass (reversibility tag) — the canonical work-model (WM-2 `work-model.ts`), extended to a second axis TechStackKind (WM-7). ADR-055 proposed a 5-layer Hybrid Scoring pipeline; the formal pipeline was never built, but its goals were realized organically (honest-gate, criteria-deriver, EffectClass→policy-gate, XVER-1, ADR-G-009). The 2026-06-30 review unifies the taxonomy + evaluation and commits to expanding the type set.

---

## Decision (Today)

```xml
<work-taxonomy ssot="src/core/work-model.ts (WM-2)">
  <task-kind>audit | document-write | code-development. Detected by scope-shape
    (filesWrite/directories), NOT title/description (gaming-proof). Priority:
    audit → document-write → code-development. Object.freeze registries.</task-kind>
  <effect-class>pure | reversible | idempotent | compensable | critical-irreversible.
    Feeds the autonomous policy-gate (WM-6): pure/reversible → auto-run; risky classes →
    PARK (human approval). gaming-proof (a worker cannot self-downgrade to skip the gate).</effect-class>
  <tech-stack>TechStackKind (WM-7) = the SECOND axis. Evaluation is TaskKind × TechStack:
    a C++ project is not held to tsc-clean; coverage required only on
    COVERAGE_MEASURABLE_STACKS (cross-ref ADR-G-009).</tech-stack>
  <scoring>the ADR-055 5-layer pipeline was NOT built as a formal module; its layers are
    realized organically — Layer-1 schema (validateResultSchema), Layer-2 gates
    (honest-gate + reconcileSpuriousNoGo + disk-verify), Layer-3 quality (tip-rubric +
    WM-7 criteria-deriver), Layer-4 EffectClass→policy-gate, Layer-5 XVER-1 cross-verify.</scoring>
</work-taxonomy>
```

---

## Intent / Roadmap (Tomorrow)

- **🔴 TASKTYPE-EXPAND:** the core 3 kinds are too narrow → add more TaskKinds (db-migration, package-publish, infrastructure-provision, security-patch, …) — each with its own rubric + effect-class + detection — plus **user-custom task-types** (ADR-UG/UP). The concepts (TaskKind × TechStack × EffectClass) are advanced enough to carry this.
- **Scoring consolidation:** decide whether to build the formal 5-layer pipeline (consolidating the organic gates — ADR-D-006 god-object-split pattern) OR formalize the organic architecture. Open architectural choice.
- **EffectClass→approval** ties the runtime ApprovalBroker (APR) for critical-irreversible.

---

## Consequences

**(+)** Work is judged by what it actually IS (kind × stack × effect), gaming-proof, with risky work parked behind approval. The canonical work-model (WM-2) is the single SSOT for the three consumers (rubric/routing/adr-selector). EffectClass→policy-gate is live in the autonomous engine.

**(−)** Only 3 core kinds today (born TASKTYPE-EXPAND); user-custom kinds are roadmap. The formal scoring pipeline is unbuilt (organic gates carry it; consolidation is an open choice).

---

## References / Absorbed

- **Absorbs:** ADR-053 + ADR-055.
- **Cross-ref:** ADR-G-009 (evaluation integrity — the deriver consumes this taxonomy) · ADR-G-006 (routing uses task-kind) · ADR-G-020 (EffectClass→approval gate) · ADR-G-032 (evolution outcome by kind) · APR (critical-irreversible approval).
- **Born / MASTER-PLAN:** TASKTYPE-EXPAND · scoring-consolidation · user-custom-task-type (UG/UP).
- **Memory:** `project_task_type_taxonomy_vision`.
