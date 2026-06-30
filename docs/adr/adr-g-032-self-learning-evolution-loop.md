# ADR-G-032: Self-Learning & Evolution Loop

**Class:** ADR-G (Global / Constitution) · **Scope:** global+project · **Immutable:** yes · **Source:** publisher · **Enforcement:** moat-preserve (the closed outcome→routing→promotion loop must not be rewritten — only deepened)
**Status:** accepted · **Date:** 2026-06-30 · **Absorbs:** ADR-074 Part-C (F5 evolution wire) + ADR-075 Part-A (6 evolution-module real callers) + ADR-078 Part-C (Active Identity-Mutation Loop)
**Crosswalk:** 074C + 075A + 078C → ADR-G-032

> **Moat note:** This is deckent's strongest differentiator — the closed **outcome → routing → promotion** learning loop. MOAT-4: PRESERVE (never rewrite; only deepen). The pivot explicitly protects it.

---

## Context

deckent learns across runs: outcomes feed routing, routing feeds agent/skill selection, success/failure feeds promotion/retirement, and agent identity itself mutates toward better performance. The pieces were built across sprints but repeatedly shipped as **dead code** (def-file present, no external caller — the `feedback_directive_kanit_letter_vs_goal` error). ADR-074C wired the suggestion path; ADR-075A added 6 real external callers; ADR-078C closed the loop with active identity-mutation. The 2026-06-30 review consolidates them into one moat-ADR and records a **basic scaling error** Alperen flagged.

---

## Decision (Today)

### 1. The Loop — modules with real runtime callers

```xml
<evolution-loop>
  <signal>outcome-tracker (per-agent/task-type success, NO_GO patterns)</signal>
  <propose>prompt-evolution (rule-based prompt-improvement suggestion) · adaptive-agent (skill add/remove proposal)</propose>
  <apply>promotion-pipeline.applyAdaptation / IdentityMutationOpts — low-success →
    mutate agent identity (systemPrompt + skill repertoire) → record parent in
    agent-genealogy → versioned A/B-testable variant (agentId-v{N+1}); requiresApproval-gated
    (nervous checkpoint); active-task agents not mutated mid-run.</apply>
  <govern>agent-genealogy (lineage) · agent-retirement (LRU/low-success retire) ·
    specialization-drift (scope-creep detect) · prompt-rollback (revert if worse) ·
    cross-sprint-analyzer (improving/degrading trends)</govern>
</evolution-loop>
```

All wired with real external callers (ADR-075A) — the loop *runs*, not just exists. (API is **class-based** — `AgentGenealogy`/`AgentRetirement`/`SpecializationDriftDetector`/`PromptRollback`; proof at class-name level, not bare function grep.)

### 2. 🔴 Selective + Scalable Update  *(Alperen 2026-06-30 — "basic ilk hata")*

```xml
<selective-scale severity="critical">
  TODAY'S ERROR: the loop updates ALL agents/skills in BULK each run (even keyed by
  last-used-sprint). WRONG.
  RULE: update ONLY the agents/skills actually USED in that run (selective).
  SCALE TEST: must remain manageable at 300 agents / 1000 skills — indexed lookup,
  lazy load, selective-update. The loop must be very well organized.
</selective-scale>
```

---

## Intent / Roadmap (Tomorrow)

- **EVOLUTION-SELECTIVE-SCALE:** rebuild the update path to touch only used agents/skills + indexed/lazy access → manages 300-agent/1000-skill fleets. (Today's bulk-update is the explicit defect to fix.)
- **LEARNINGS-QUALITY** (ADR-G-035): the recorded Learnings/Gains are "nice but half-baked / not genuinely learned" — perfect the learned-content so the loop's memory is real, for dogfood AND user.
- **Identity-mutation at scale:** 1000+-variant validation (F5-008r) + auto-apply (after the human-review advisory phase proves signal quality).

---

## Consequences

**(+)** The differentiating moat is closed-loop and live (not proposed): underperforming agents are actually mutated, genealogy-tracked, A/B-verified. Outcome data drives routing + promotion continuously.

**(−)** The bulk-update scaling error (§2) must be fixed before large agent/skill catalogs (born: EVOLUTION-SELECTIVE-SCALE). Learned-content quality is an open gap (LEARNINGS-QUALITY). Mutation auto-apply is gated behind an advisory-proof phase (today suggestions are advisory, requiresApproval for identity-mutation).

---

## References / Absorbed

- **Absorbs:** ADR-074 Part-C + ADR-075 Part-A + ADR-078 Part-C.
- **Cross-ref:** ADR-G-035 (memory substrate + LEARNINGS-QUALITY) · ADR-G-006 (routing — consumes outcomes) · ADR-G-023 (agent/skill taxonomy) · ADR-G-022 (nervous — mutation approval checkpoint) · ADR-G-020 (requiresApproval gate).
- **Born:** EVOLUTION-SELECTIVE-SCALE (🔴 critical) · LEARNINGS-QUALITY.
- **Memory:** `project_autonomous_first_dogfood_grand_vision` · `feedback_directive_kanit_letter_vs_goal` · MOAT-4 (preserve).
