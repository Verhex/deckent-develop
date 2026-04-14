// ─── Sprint Reporter (Thin Barrel) ───────────────────────────────
// This file was split into 4 focused modules in Sprint 134 (Task 134-009).
// All public exports are re-exported here so consumers don't need to change imports.
//
// Modules:
//   sprint-metrics.ts      — metric calculation, aggregation, comparison, coverage
//   sprint-retro-writer.ts — retro generation, learnings, memory, decay
//   sprint-docs-updater.ts — managed-docs, project identity, sprint log, debt, archive
//   ci-reporter.ts         — CI baseline, health, trend, learning integration

// ═══ sprint-metrics.ts ═══════════════════════════════════════════
export {
  formatTokenCount,
  buildTokenUsageSection,
  calculateMetrics,
  compareWithPreviousSprint,
  readPreviousSprintMetrics,
  formatDuration,
  formatDurationShort,
  calculateSelfHealingRate,
  countFirstTryTasks,
  countNewTestFiles,
  countSelfHealedTasks,
  buildAgentPerformance,
  formatAgentPerformanceTable,
  buildSkillPerformance,
  formatSkillPerformanceTable,
  generateConfigSuggestions,
  detectRecurringFileErrors,
  buildBrainInsights,
  extractSprintNumber,
} from './sprint-metrics.js';

export type {
  SprintComparison,
  AgentPerformanceRow,
  SkillPerformanceRow,
  SelfHealingRate,
  ConfigSuggestion,
} from './sprint-metrics.js';

// ═══ sprint-retro-writer.ts ═════════════════════════════════════
export {
  trimMemoryWithHeader,
  formatHumanRetro,
  buildRetroHighlights,
  buildRetroIssues,
  buildRetroLearnings,
  writeRetrospective,
  formatHumanSprintComplete,
  buildWhatWentWell,
  buildWhatNeedsAttention,
  formatRubricScoresSection,
} from './sprint-retro-writer.js';

export type {
  HumanRetroData,
  SprintCompleteData,
} from './sprint-retro-writer.js';

// ═══ sprint-docs-updater.ts ═════════════════════════════════════
export {
  writeSprintLog,
  updateProjectDocs,
  generateProjectIdentity,
  countProjectTestCases,
  parseCoverageFromClover,
  getTestCountFromVitest,
  getCoverageFromVitest,
  readPreviousTestCount,
  updateProjectIdentity,
  autoResolveDebt,
  autoDraftDecisions,
  addRecurringPatternsToFile,
  collectSprintFiles,
  archiveDirectives,
  archiveOrphanTasks,
} from './sprint-docs-updater.js';

export type {
  ProjectIdentityInfo,
} from './sprint-docs-updater.js';

// ═══ ci-reporter.ts ═════════════════════════════════════════════
export {
  readCiReportTrend,
  formatCiHealthSection,
  appendCiHealthToRetro,
  runCiLearningAnalysis,
  appendCiLearningsToMemory,
} from './ci-reporter.js';

export type {
  CiTrendEntry,
  CiTrend,
  CiLearningResult,
} from './ci-reporter.js';
