// ─── Configuration Domain Types ─────────────────────────────────────────────
// Split from types.ts — Config, setup, CLI, and project analysis types

import type { DecisionEngineConfig, LearningConfig, CollaborationConfig } from './decision-config.js';
import type { NotificationConfig } from './notifications.js';
import type { ModelType, ProviderName, EvaluationRubric } from './task-types.js';
import type { ModelStrategy } from './mode-presets.js';
import type { ModelTier } from './model-equivalence.js';

// ─── Configuration (Blueprint 13) ───────────────────────────────────
export interface PlanModeConfig {
  max_workers: number | 'auto';
  brain_model: ModelType;
  default_model: ModelType;
  haiku_allowed: boolean;
  /** Tier-based minimum model tier. Preferred over haiku_allowed.
   *  When set, haiku_allowed is ignored. Backward compat: haiku_allowed=false → min_tier='standard'. */
  min_tier?: ModelTier;
  budget_per_sprint?: number;
  requires?: string;
  brain_planning?: BrainPlanningMode;
}

export type BrainPlanningMode = 'ai' | 'structured' | 'auto';

export type PlanMode = 'performance' | 'balanced' | 'economic' | 'api' | 'max_plan' | 'max5x_plan' | 'pro_plan';

export interface SkillConfig {
  enabled: boolean;
  maxPerTask: number;         // default 3
  autoDetectStack: boolean;   // default true
  preferredSkills: string[];
}

/** Tuning parameters for adaptive threshold adjustment */
export interface AdaptiveConfig {
  /** Minimum number of past sprints required before adjusting (default: 3) */
  min_samples: number;
  /** NO_GO rate threshold (0-1) above which agent_min_score is lowered (default: 0.3) */
  no_go_threshold: number;
  /** Number of recent sprints to consider for coverage averaging (default: 3) */
  coverage_lookback: number;
}

export interface DeckentConfig {
  mode: PlanMode;
  modes: Record<string, PlanModeConfig>;
  language?: string;
  projectName?: string;
  /** Last completed sprint ID (e.g. 'sprint-091') */
  last_sprint_id?: string;
  version?: string;
  auto_docs?: AutoDocsConfig;
  /** Spawn backend: 'docker' | 'tmux' | 'subprocess' | 'auto' (default: 'auto') */
  spawn_backend?: 'docker' | 'tmux' | 'subprocess' | 'auto';
  /** Docker image for worker containers (default: 'deckent-worker:latest') */
  docker_image?: string;
  /** Docker container timeout in seconds (default: 1200 = 20 minutes) */
  docker_timeout?: number;
  /** Skill system configuration */
  skills?: SkillConfig;
  /** Decision engine configuration */
  decision_engine?: DecisionEngineConfig;
  /** Learning system configuration */
  learning?: LearningConfig;
  /** Collaboration configuration */
  collaboration?: CollaborationConfig;
  /** Notification configuration */
  notifications?: NotificationConfig;
  /** Auto-remove stale locks (>5min) during auditor scan. Default: false */
  auto_clean_locks?: boolean;
  /** Provider for Brain planning (default: 'claude') */
  brain_provider?: ProviderName;
  /** Default provider for workers (default: 'claude') */
  worker_provider?: ProviderName;
  /** Fallback when primary provider unavailable */
  fallback_provider?: ProviderName;
  /** Per-task-type provider overrides */
  provider_overrides?: Record<string, ProviderName>;
  /** Tier-based model selection strategy. Merged with mode preset defaults.
   *  Partial — unset fields fall back to the active mode preset. */
  model_strategy?: Partial<ModelStrategy>;
  /** Grouped provider config (alternative to flat brain_provider/worker_provider).
   *  Both formats supported — grouped takes precedence when both present. */
  providers?: {
    brain?: ProviderName;
    worker?: ProviderName;
    fallback?: ProviderName;
    overrides?: Record<string, ProviderName>;
  };
  /** Auto-select cheapest capable provider (default: false) */
  cost_optimization?: boolean;
  /** Claude execution backend: 'tmux' (default), 'subprocess' (headless), 'mcp' (future) */
  claude_backend?: 'tmux' | 'subprocess' | 'mcp';
  /** Optional API keys (prefer env vars) */
  api_keys?: Record<string, string>;

  // ─── Output & Display ──────────────────────────────────────────────
  /** Show kraken splash on init/version (default: true) */
  output_splash?: boolean;
  /** Output verbosity: quiet (minimal), normal (default), verbose (extra detail) */
  output_mode?: 'quiet' | 'normal' | 'verbose';
  /** Output theme (default: 'default') */
  output_theme?: 'default' | 'minimal' | 'rich';

  // ─── Skill-Based Provider Routing ──────────────────────────────────
  /** Skill-based provider routing overrides */
  skill_routing?: {
    design?: string | null;
    testing?: string | null;
    docs?: string | null;
    default?: string;
  };

  // ─── Search & Documentation ────────────────────────────────────────
  /** Enable online search for documentation (default: true) */
  search_enabled?: boolean;
  /** Search provider (default: 'context7') */
  search_provider?: 'context7' | 'web' | 'none';
  /** Search cache TTL in seconds (default: 3600) */
  search_cache_ttl?: number;

  // ─── Notifications ─────────────────────────────────────────────────
  /** Notify on sprint completion (default: false) */
  notify_on_complete?: boolean;
  /** Notification channel */
  notify_channel?: 'slack' | 'discord' | 'email' | 'webhook' | null;
  /** Notification webhook URL */
  notify_url?: string | null;

  // ─── Telemetry ─────────────────────────────────────────────────────
  /** Telemetry enabled (default: false) */
  telemetry_enabled?: boolean;
  /** Anonymous telemetry (default: true) */
  telemetry_anonymous?: boolean;

  // ─── Environment Detection ─────────────────────────────────────────
  /** Auto-detected environment */
  detected_env?: 'vscode' | 'codex' | 'gemini' | 'cursor' | 'tmux' | 'shell' | null;
  /** Multi-IDE mode (default: false) */
  multi_ide_mode?: boolean;

  // ─── Auth ──────────────────────────────────────────────────────────
  /** Auth mode (default: 'subscription') */
  auth_mode?: 'subscription' | 'api' | 'hybrid';
  /** Bearer token for HTTP API authentication. Falls back to DECKENT_API_TOKEN env var. */
  api_auth_token?: string;

  // ─── Memory ─────────────────────────────────────────────────────────
  /** Max lines in .brain/ directory (default: 600) */
  memory_budget?: number;
  /** Decay entries older than N sprints (default: 5) */
  decay_after_sprints?: number;
  /** Enable pattern detection (default: true) */
  patterns_enabled?: boolean;
  /** Enable PROJECT-IDENTITY.md updates (default: true) */
  project_identity_enabled?: boolean;

  // ─── Auditor ────────────────────────────────────────────────────────
  /** Auditor scan interval in seconds (default: 30) */
  scan_interval?: number;
  /** Heartbeat timeout in seconds — stale after this (default: 120) */
  heartbeat_timeout?: number;
  /** Enforce worker scope boundaries (default: true) */
  boundary_enforcement?: boolean;
  /** Lock stale threshold in seconds (default: 300) */
  lock_stale_threshold?: number;

  // ─── Human Checkpoints ──────────────────────────────────────────────
  /** Human approval checkpoints in sprint lifecycle.
   *  Valid values: 'plan', 'evaluate', 'fix'. Empty array = fully autonomous. */
  human_checkpoints?: ('plan' | 'evaluate' | 'fix')[];

  // ─── Sprint ─────────────────────────────────────────────────────────
  /** Enable fix phase after initial execution (default: true) */
  fix_phase_enabled?: boolean;
  /** Max retries during fix phase (default: 2) */
  max_fix_retries?: number;
  /** AI planner subprocess timeout in milliseconds (default: 60000) */
  ai_planner_timeout?: number;
  /** Minimum coverage % to pass without tech debt (default: 90).
   * Adaptive suggestion: if avg coverage < 70 over last 3 sprints, auto-lower to avg. */
  coverage_threshold?: number;
  /** Max reroute attempts per task during mid-sprint adapter (default: 3) */
  max_reroutes?: number;
  /** Also reroute GO_WITH_TECH_DEBT tasks, not just NO_GO (default: false) */
  reroute_on_tech_debt?: boolean;
  /** Sprint timeout in minutes. 0 = unlimited (no timeout). Positive = minutes. Default: 0 */
  sprint_timeout_minutes?: number;

  // ─── Rollback ───────────────────────────────────────────────────────
  /** Rollback policy: 'never' | 'on_failure' | 'always' (default: 'never') */
  rollback_policy?: 'never' | 'on_failure' | 'always';

  // ─── Rubric-Based Evaluation ──────────────────────────────────────
  /** Custom evaluation rubric overrides (merged with DEFAULT_RUBRIC) */
  evaluation_rubric?: Partial<EvaluationRubric>;
  /** Max retries when rubric evaluation fails (default: 0, max: 3) */
  rubric_max_retries?: number;

  // ─── Adaptive Thresholds ────────────────────────────────────────────
  /** Auto-adjust routing parameters based on sprint NO_GO rate (default: false) */
  adaptive_thresholds?: boolean;
  /** Minimum agent score for routing selection (default: 5, range: 2-8) */
  agent_min_score?: number;
  /** Adaptive threshold tuning parameters */
  adaptive_config?: AdaptiveConfig;

  // ─── Routing Engine v2 ─────────────────────────────────────────────
  /** Routing engine version: 'v1' (keyword-based), 'v2' (intent-based). Default: 'v2' */
  routing_engine?: 'v1' | 'v2';
  /** Delay in ms before cleanup deletes .tasks/ files. Default: 180000 (180s). Set 0 for immediate. */
  cleanup_delay_ms?: number;
  /** Routing engine tuning parameters (v2 only) */
  routing_config?: {
    agentMinScore?: number;
    skillMinScore?: number;
    confidenceThreshold?: number;
    maxSkillsDefault?: number;
  };

  // ─── Plugin Security ──────────────────────────────────────────────
  /** Require valid SHA-256 signature for plugin hook modules (default: false).
   *  When true, unsigned plugins are rejected. When false, they emit a warning. */
  plugin_require_signature?: boolean;
}

export interface ResolvedConfig {
  mode: PlanMode;
  activeModeConfig: PlanModeConfig;
  modes: Record<string, PlanModeConfig>;
  language: string;
  projectName: string;
  projectRoot: string;
  version: string;
  /** Resolved tier-based model strategy (from mode preset + config overrides) */
  model_strategy?: ModelStrategy;
  auto_docs?: AutoDocsConfig;
  /** Spawn backend: 'docker' | 'tmux' | 'subprocess' | 'auto' (default: 'auto') */
  spawn_backend?: 'docker' | 'tmux' | 'subprocess' | 'auto';
  /** Docker image for worker containers (default: 'deckent-worker:latest') */
  docker_image?: string;
  /** Docker container timeout in seconds (default: 1200 = 20 minutes) */
  docker_timeout?: number;
  /** Skill system configuration */
  skills?: SkillConfig;
  /** Provider for Brain planning (default: 'claude') */
  brain_provider?: ProviderName;
  /** Default provider for workers (default: 'claude') */
  worker_provider?: ProviderName;
  /** Fallback when primary provider unavailable */
  fallback_provider?: ProviderName;
  // Memory
  memory_budget?: number;
  decay_after_sprints?: number;
  patterns_enabled?: boolean;
  project_identity_enabled?: boolean;
  // Auditor
  scan_interval?: number;
  heartbeat_timeout?: number;
  boundary_enforcement?: boolean;
  lock_stale_threshold?: number;
  // Human Checkpoints
  human_checkpoints?: ('plan' | 'evaluate' | 'fix')[];
  // Sprint
  fix_phase_enabled?: boolean;
  max_fix_retries?: number;
  /** AI planner subprocess timeout in milliseconds (default: 60000) */
  ai_planner_timeout?: number;
  /** Minimum coverage % to pass without tech debt (default: 90).
   * Adaptive suggestion: if avg coverage < 70 over last 3 sprints, auto-lower to avg. */
  coverage_threshold: number;
  /** Max reroute attempts per task during mid-sprint adapter (default: 3) */
  max_reroutes: number;
  /** Also reroute GO_WITH_TECH_DEBT tasks, not just NO_GO (default: false) */
  reroute_on_tech_debt: boolean;
  /** Sprint timeout in minutes. 0 = unlimited. Default: 0 */
  sprint_timeout_minutes: number;
  // Adaptive Thresholds
  adaptive_thresholds: boolean;
  agent_min_score: number;
  adaptive_config: AdaptiveConfig;
  // Rollback
  rollback_policy?: 'never' | 'on_failure' | 'always';
  // Rubric-Based Evaluation
  evaluation_rubric?: Partial<EvaluationRubric>;
  rubric_max_retries?: number;
  // Routing Engine v2
  routing_engine?: 'v1' | 'v2';
  routing_config?: {
    agentMinScore?: number;
    skillMinScore?: number;
    confidenceThreshold?: number;
    maxSkillsDefault?: number;
  };
  /** Delay in ms before cleanup deletes .tasks/ files. Default: 180000 (180s) */
  cleanup_delay_ms?: number;
  /** Enable task dependency pipeline — only spawn tasks whose deps are DONE. Default: false */
  dependency_pipeline_enabled?: boolean;
}

// ─── Config Metadata ──────────────────────────────────────────────
export type ConfigCategory =
  | 'provider'
  | 'sprint'
  | 'memory'
  | 'auditor'
  | 'skill_routing'
  | 'search'
  | 'notifications'
  | 'telemetry'
  | 'environment'
  | 'output'
  | 'rollback'
  | 'auto_docs';

export interface ConfigFieldMeta {
  description: string;
  type: string;
  default: unknown;
  category: ConfigCategory;
  options?: readonly string[];
}

// ─── Auto Docs Config ─────────────────────────────────────────────
export interface AutoDocsConfig {
  tier1: boolean;  // CHANGELOG, SPRINT-LOG
  tier2: boolean;  // README counts, CONTRIBUTING, HEALTH-CHECK
  tier3: boolean;  // BLUEPRINT, ARCHITECTURE
}

// ─── CLI Types ──────────────────────────────────────────────────────
// autoApprove: passed to tmux as --dangerously-skip-permissions (CLI/spawn only)
// sandboxMode: Docker sandbox flag (not yet implemented)
// haikuAllowed (PlanModeConfig): model selection constraint only — never used for permissions
export interface StartOptions {
  autoApprove?: boolean;
  sandboxMode?: boolean;
}

export interface DoctorResult {
  ok: boolean;
  checks: {
    name: string;
    passed: boolean;
    message: string;
    required: boolean;
  }[];
}

// ─── Subscription ───────────────────────────────────────────────────
export type SubscriptionDetected = 'max' | 'pro' | 'unknown';
export type DetectionMethod = 'opus_probe' | 'cli_missing' | 'timeout' | 'error';

export interface SubscriptionProfile {
  detected: SubscriptionDetected;
  opusAvailable: boolean;
  testedAt: string;
  method: DetectionMethod;
}

// ─── Setup Recommendation ──────────────────────────────────────────
export interface SetupRecommendation {
  mode: PlanMode;
  maxWorkers: number;
  /** @deprecated Use brain_tier instead. Kept for backward compatibility. */
  brainModel: ModelType;
  /** @deprecated Use worker_tier instead. Kept for backward compatibility. */
  defaultModel: ModelType;
  /** Tier-based brain model selection (provider-agnostic). */
  brain_tier: ModelTier;
  /** Tier-based worker model selection (provider-agnostic). */
  worker_tier: ModelTier;
  planning: BrainPlanningMode;
  reasons: string[];
}

// ─── Project Analysis ──────────────────────────────────────────────
export type DetectedFramework = 'react' | 'next' | 'express' | 'nest' | 'vue' | 'angular' | 'svelte' | 'django' | 'flask' | 'fastapi' | 'spring' | 'unknown';
export type DetectedLanguage = 'typescript' | 'javascript' | 'python' | 'rust' | 'go' | 'java' | 'c' | 'cpp' | 'mixed' | 'unknown';
export type DetectedTestFramework = 'vitest' | 'jest' | 'mocha' | 'pytest' | 'unittest' | 'junit' | 'go_test' | 'cargo_test' | 'ctest' | 'unknown';
export type DetectedBuildTool = 'tsc' | 'vite' | 'webpack' | 'esbuild' | 'turbo' | 'cargo' | 'go' | 'maven' | 'gradle' | 'cmake' | 'make' | 'meson' | 'setuptools' | 'unknown';
export type DetectedCI = 'github-actions' | 'gitlab-ci' | 'circleci' | 'unknown';
export type ProjectSize = 'small' | 'medium' | 'large';
export type MethodologyRecommendation = 'micro-sprint' | 'sprint' | 'agile' | 'hybrid';

export interface AnalyzerSuggestion {
  field: string;
  value: string;
  reason: string;
}

export interface ProjectAnalysis {
  framework: DetectedFramework;
  language: DetectedLanguage;
  detectedLanguages: string[];
  testFramework: DetectedTestFramework;
  buildTool: DetectedBuildTool;
  ci: DetectedCI;
  fileCount: number;
  locCount: number;
  authorCount: number;
  size: ProjectSize;
  methodology: MethodologyRecommendation;
  subProjects: string[];
  configSuggestions: AnalyzerSuggestion[];
}

// ─── System Profile ─────────────────────────────────────────────────
export interface SystemProfile {
  cpuCores: number;
  totalMemMB: number;
  freeMemMB: number;
  recommendedMaxWorkers: number;
}
