export * from './types.js';
export * from './constants.js';
export { countBrainLines, getNextSprintId, parseDebtTable, generateDebtTable } from './utils.js';
export {
  loadConfig,
  getDefaultConfig,
  getDefaultModes,
  validatePartialConfig,
  validateConfig,
  resolveEffectiveWorkers,
  ConfigValidationError,
} from './config.js';
export { analyzeProject } from './analyzer.js';
export { getSystemProfile, calcRecommendedMaxWorkers } from './system-profile.js';
export {
  detectSubscription,
  saveSubscriptionToConfig,
  checkModeCompatibility,
} from './subscription.js';

// ─── Routing Engine v2 ──────────────────────────────────────────────────────
export type {
  TaskDNA, IntentType, OperationType, TaskSize,
  ActivationRule, ExclusionRule, ActivationConfig, ActivationResult,
  ConfidenceLevel, RoutingDecision, SkillBudget, UserOverride, LearningBonus,
  RoutingEngineConfig, OverrideSource,
} from './routing-types.js';
export {
  createDefaultTaskDNA, createDefaultActivationConfig, createDefaultRoutingEngineConfig,
  isValidIntentType, ALL_INTENT_TYPES, SKILL_BUDGET_BY_SIZE, LEARNING_BONUS_CAP,
} from './routing-types.js';
export { classifyIntent } from './intent-classifier.js';
export { evaluateActivation, evaluateRule, evaluateExclusion } from './activation-engine.js';
export { routeTaskV2, calculateSkillBudget, resolveOverrides, calculateConfidence } from './routing-engine.js';
export { evaluateCondition, resolvePath } from './condition-evaluator.js';
export { needsMigration, isV2Manifest, migrateAgentManifest, migrateSkillManifest } from './manifest-migrator.js';
