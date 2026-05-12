# Dead Code Audit Report — Sprint 139

**Date:** 2026-05-12
**Tool:** scripts/dead-code-audit.mjs
**Scope:** src/ directory (read-only analysis)

## Summary

| Category | Modules | Total Lines |
|----------|---------|-------------|
| Dead | 3 | 561 |
| Dormant (ADR-protected) | 4 | 495 |
| Lightly-Used | 0 | 0 |
| Active | 1 | 121 |

## Dead Code (safe to remove)

These modules have **zero imports** in src/ and are not protected by any ADR.

### src/orchestra/handoff-protocol.ts
- **Lines:** 152
- **Reason:** Sprint 132 audit suspect — not imported by any src/ file
- **Imported by:** nobody
- **Action:** Safe to remove in Step 2

### src/orchestra/batch-stats.ts
- **Lines:** 141
- **Reason:** Stats batching utility — not imported by any src/ file
- **Imported by:** nobody
- **Action:** Safe to remove in Step 2

### src/orchestra/brain-context.ts
- **Lines:** 268
- **Reason:** Context enrichment functions — not imported by any src/ file
- **Imported by:** nobody
- **Action:** Safe to remove in Step 2

## Dormant Code (ADR-protected, do not remove)

These modules are deprecated but preserved by ADR decisions.

### src/orchestra/decision-engine.ts
- **Lines:** 170
- **Reason:** V1 DecisionOrchestrator — deprecated by ADR-028, kept as reference
- **Imported by:** src/orchestra/decision-steps/agent-step.ts, src/orchestra/decision-steps/scope-step.ts, src/orchestra/decision-replay.ts, src/nervous/decision-engine.ts
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

- **src/orchestra/multi-agent.ts** — 2 importers (src/mcp/server.ts, src/cli/helpers/cursor-config.ts)

## Unused Export Sampling

Found **657** potentially unused exports across src/.
Top 20 shown below (full list requires deeper analysis):

| File | Export | Import Count |
|------|--------|-------------|
| src/orchestra/handoff-protocol.ts | HandoffProtocol | 0 |
| src/orchestra/rollback.ts | getDirtyFiles | 0 |
| src/orchestra/rollback.ts | getCurrentCommitSha | 0 |
| src/orchestra/rollback.ts | getCurrentBranch | 0 |
| src/orchestra/rollback.ts | deleteSafetyPointFile | 0 |
| src/orchestra/rollback.ts | loadSafetyPoint | 0 |
| src/orchestra/evaluation-audit-trail.ts | EvaluationAuditRecord | 0 |
| src/orchestra/evaluation-audit-trail.ts | EvaluationAuditInput | 0 |
| src/orchestra/evaluation-audit-trail.ts | evaluationAuditPath | 0 |
| src/orchestra/mid-sprint-adapter.ts | RerouteResult | 0 |
| src/orchestra/mid-sprint-adapter.ts | ReconciliationResult | 0 |
| src/orchestra/mid-sprint-adapter.ts | ReconciliationDeps | 0 |
| src/orchestra/mid-sprint-adapter.ts | RubricReconciliationReason | 0 |
| src/orchestra/mid-sprint-adapter.ts | RubricReconciliationResult | 0 |
| src/orchestra/mid-sprint-adapter.ts | RUBRIC_RECONCILIATION_THRESHOLDS | 0 |
| src/orchestra/promotion-pipeline.ts | PromotionCriteria | 0 |
| src/orchestra/promotion-pipeline.ts | DemotionCriteria | 0 |
| src/orchestra/promotion-pipeline.ts | PromotionResult | 0 |
| src/orchestra/task-retry.ts | MAX_RETRY_COUNT | 0 |
| src/orchestra/task-retry.ts | RETRY_BACKOFF_MS | 0 |

## Recommendations

1. **Step 2 (Sprint 140+):** Remove Dead modules (3 files, ~561 LoC) with full test verification
2. **ADR Amendment:** If V1 decision engine is no longer needed as reference, amend ADR-028 to allow removal (~495 LoC)
3. **Lightly-Used Review:** Consider inlining single-consumer modules to reduce coupling
4. **Unused Export Cleanup:** Review top unused exports for dead function-level code
