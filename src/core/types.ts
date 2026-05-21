// ─── Barrel Re-export ───────────────────────────────────────────────────────
// types.ts has been split into domain-specific files for maintainability.
// All exports are re-exported here for backward compatibility.
// Consumers can continue to import from './types.js' without changes.
//
// Sprint 179 W1-1: DebtItem extended with `class` + `originScope` (definitions
// live in sprint-types.ts; re-exported below). See sprint-planner.ts
// injectCriticalDebtTasks() for the auto-debt scope-inheritance + skip logic.

export * from './task-types.js';
export * from './config-types.js';
export * from './monitoring-types.js';
export * from './sprint-types.js';
