# Dead Code Audit Report — Sprint 139

**Date:** 2026-06-27
**Tool:** scripts/dead-code-audit.mjs
**Scope:** src/ directory (read-only analysis)

## Summary

| Category | Modules | Total Lines |
|----------|---------|-------------|
| Dead | 1 | 285 |
| Dormant (ADR-protected) | 4 | 553 |
| Lightly-Used | 0 | 0 |
| Active | 2 | 315 |

## Dead Code (safe to remove)

These modules have **zero imports** in src/ and are not protected by any ADR.

### src/orchestra/brain-context.ts
- **Lines:** 285
- **Reason:** Context enrichment functions — not imported by any src/ file
- **Imported by:** nobody
- **Action:** Safe to remove in Step 2

## Dormant Code (ADR-protected, do not remove)

These modules are deprecated but preserved by ADR decisions.

### src/orchestra/decision-engine.ts
- **Lines:** 228
- **Reason:** V1 DecisionOrchestrator — deprecated by ADR-028, kept as reference
- **Imported by:** src/orchestra/sprint-spawner.ts, src/orchestra/sprint-controller.ts, src/orchestra/decision-steps/agent-step.ts, src/orchestra/decision-steps/scope-step.ts, src/orchestra/decision-replay.ts, src/nervous/decision-engine.ts, src/nervous/bootstrap.ts
- **Action:** Keep — requires ADR amendment to remove

### src/orchestra/decision-replay.ts
- **Lines:** 150
- **Reason:** V1 decision replay — deprecated by ADR-028, kept as reference
- **Imported by:** nobody (test-only)
- **Action:** Keep — requires ADR amendment to remove

### src/orchestra/decision-steps/agent-step.ts
- **Lines:** 83
- **Reason:** V1 agent step — deprecated by ADR-028, kept as reference
- **Imported by:** src/orchestra/decision-engine.ts
- **Action:** Keep — requires ADR amendment to remove

### src/orchestra/decision-steps/scope-step.ts
- **Lines:** 92
- **Reason:** V1 scope step — deprecated by ADR-028, kept as reference
- **Imported by:** src/orchestra/decision-engine.ts
- **Action:** Keep — requires ADR amendment to remove

## Lightly-Used Code (single consumer)

No lightly-used modules found among known suspects.

## Active Code (healthy usage)

These suspects turned out to be actively used.

- **src/orchestra/handoff-protocol.ts** — 3 importers (src/orchestra/task-builder.ts, src/orchestra/sprint-controller.ts, src/orchestra/sprint-finalizer.ts)
- **src/orchestra/multi-agent.ts** — 2 importers (src/mcp/server.ts, src/cli/helpers/cursor-config.ts)

## Unused Export Sampling

Found **1300** potentially unused exports across src/.
Top 20 shown below (full list requires deeper analysis):

| File | Export | Import Count |
|------|--------|-------------|
| src/orchestra/quality-assessor.ts | isCoverageEscapeHatchTask | 0 |
| src/orchestra/quality-assessor.ts | COVERAGE_UNMEASURED_OVERALL_CEILING | 0 |
| src/orchestra/quality-assessor.ts | COVERAGE_UNMEASURED_PARTIAL_CREDIT | 0 |
| src/orchestra/rollback.ts | getDirtyFiles | 0 |
| src/orchestra/rollback.ts | getCurrentCommitSha | 0 |
| src/orchestra/rollback.ts | getCurrentBranch | 0 |
| src/orchestra/rollback.ts | deleteSafetyPointFile | 0 |
| src/orchestra/rollback.ts | loadSafetyPoint | 0 |
| src/orchestra/evaluation-audit-trail.ts | EvaluationAuditRecord | 0 |
| src/orchestra/evaluation-audit-trail.ts | EvaluationAuditInput | 0 |
| src/orchestra/evaluation-audit-trail.ts | evaluationAuditPath | 0 |
| src/orchestra/prompt-segmentation.ts | DEFAULT_TIER | 0 |
| src/orchestra/prompt-segmentation.ts | classifyTier | 0 |
| src/orchestra/prompt-segmentation.ts | TieredSegments | 0 |
| src/orchestra/prompt-segmentation.ts | segmentByTier | 0 |
| src/orchestra/prompt-segmentation.ts | computeStablePrefix | 0 |
| src/orchestra/prompt-segmentation.ts | PROTECTED_KINDS | 0 |
| src/orchestra/prompt-segmentation.ts | ProtectedKind | 0 |
| src/orchestra/prompt-segmentation.ts | ProtectedSetSources | 0 |
| src/orchestra/prompt-segmentation.ts | findUnprotected | 0 |

## Recommendations

1. **Step 2 (Sprint 140+):** Remove Dead modules (1 files, ~285 LoC) with full test verification
2. **ADR Amendment:** If V1 decision engine is no longer needed as reference, amend ADR-028 to allow removal (~553 LoC)
3. **Lightly-Used Review:** Consider inlining single-consumer modules to reduce coupling
4. **Unused Export Cleanup:** Review top unused exports for dead function-level code
