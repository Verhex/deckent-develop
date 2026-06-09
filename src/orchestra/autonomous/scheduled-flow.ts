// Autonomous-engine scheduled-flow shim.
//
// SSOT consolidation (Sprint 263): the full 5-field cron evaluator now lives in
// `core/scheduled-flow.ts` (Sprint 262 T8 ported complete minute/hour/dom/month/dow
// support — ranges, lists, steps — into the LIVE core implementation that
// FlowScheduler uses). This module previously carried a parallel copy of `nextRun`;
// that duplicate is removed and we now re-export the canonical core implementation
// so there is ONE source of truth for cron evaluation.
//
// Kept as a thin re-export (rather than deleted) because the autonomous test suite
// imports `nextRun` from here; the re-export means that test now exercises the
// canonical core evaluator.
export type { ParsedCronExpr, ScheduledFlow } from '../../core/scheduled-flow.js';
export { parseCronExpr, nextRun } from '../../core/scheduled-flow.js';
