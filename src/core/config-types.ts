// ─── Configuration Domain Types ─────────────────────────────────────────────
// Split from types.ts — Config, setup, CLI, and project analysis types

import type { DecisionEngineConfig, LearningConfig, CollaborationConfig } from './decision-config.js';
import type { NotificationConfig } from './notifications.js';
import type { ModelType, ProviderName, EvaluationRubric } from './task-types.js';
import type { ModelStrategy } from './mode-presets.js';
import type { ModelTier } from './model-equivalence.js';

// ─── Timeout Configuration ──────────────────────────────────────────
export interface TimeoutConfig {
  /** Docker backend minimum timeout in seconds (default: 1200) */
  docker_min_timeout: number;
  /** Docker backend maximum timeout in seconds (default: 7200) */
  docker_max_timeout: number;
  /** Tmux backend minimum timeout in seconds (default: 900) */
  tmux_min_timeout: number;
  /** Tmux backend maximum timeout in seconds (default: 5400) */
  tmux_max_timeout: number;
  /** Subprocess backend minimum timeout in seconds (default: 600) */
  subprocess_min_timeout: number;
  /** Subprocess backend maximum timeout in seconds (default: 3600) */
  subprocess_max_timeout: number;
  /** Base timeout per effort level in seconds */
  effort_base: { low: number; normal: number; high: number };
  /** Scale timeout based on lines-of-code estimate (default: true) */
  loc_scaling_enabled: boolean;
  /** Scale timeout based on historical sprint data (default: true) */
  history_scaling_enabled: boolean;
  /** Allow runtime extension of timeout (default: false) */
  runtime_extension_enabled: boolean;
}

// ─── Terminal Configuration ─────────────────────────────────────────
export interface TerminalConfig {
  enabled: boolean;
  /** Bind address for the terminal WS. Default 127.0.0.1. */
  bind: string;
  /** Max concurrent PTY sessions. */
  maxSessions: number;
  /** Idle reaper timeout (ms) for shell/ai kinds; deckent kind exempt. */
  idleTimeoutMs: number;
  /** Per-session in-memory scrollback ring buffer size (bytes). */
  scrollbackBytes: number;
  /** Whether the plain `shell` session kind is allowed. */
  allowShellKind: boolean;
  /**
   * Per-tenant outbound byte quota over a 24h window (W4-10, invariant I5).
   * Crossing 50% triggers a one-shot warn event; reaching 100% kills the
   * session and closes the WS with code 4429.
   */
  outboundDailyQuotaBytes?: number;
}

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
  /** Output render mode for formatStatus() dispatcher.
   *  'explainatory' — emoji + multi-line + Türkçe + ★ Insight blocks (default)
   *  'standart'     — minimal single-line summary + markdown table
   *  'verbose'      — full worker output stream + timestamps + metric snapshot
   *  'json'         — JSON.stringify
   */
  output_render_mode?: 'explainatory' | 'standart' | 'verbose' | 'json';

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
  /** Notification channel (legacy — superseded by notify_connectors; never wired) */
  notify_channel?: 'slack' | 'discord' | 'email' | 'webhook' | null;
  /** Notification webhook URL (legacy — superseded by notify_connectors) */
  notify_url?: string | null;
  /**
   * Outbound messaging connectors (BOT-001, §4G). Sprint notifications fan out
   * to each enabled connector at its chat_id. Tokens via .deck ($DECK:NAME),
   * resolved at config load. Supersedes the legacy notify_channel/notify_url.
   */
  notify_connectors?: Partial<Record<'telegram' | 'discord', {
    enabled: boolean;
    /** Bot token — use "$DECK:TELEGRAM_TOKEN" (resolved from .deck). */
    token: string;
    /** Target chat/channel id the notifications are sent to. */
    chat_id: string;
  }>>;

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

  // ─── Memory (V1 — flat .md files) ───────────────────────────────────
  /** @deprecated Use memory.backend instead. Kept for V1 backward compat. */
  /** Max lines in .brain/ directory (default: 600) */
  memory_budget?: number;
  /** @deprecated Use memory.decay_after_sprints instead. Kept for V1 backward compat. */
  /** Decay entries older than N sprints (default: 5) */
  decay_after_sprints?: number;
  /** Enable pattern detection (default: true) */
  patterns_enabled?: boolean;
  /** Enable PROJECT-IDENTITY.md updates (default: true) */
  project_identity_enabled?: boolean;

  // ─── Memory V2 ─────────────────────────────────────────────────────
  /** Memory V2 configuration. If present, DB-first mode is active. */
  memory?: {
    /** Storage backend (default: 'sqlite') */
    backend?: 'sqlite' | 'json';
    /** Search mode (default: 'fts5') */
    search?: 'fts5' | 'semantic' | 'hybrid';
    /** Semantic search provider (requires search='semantic'|'hybrid') */
    semantic_provider?: 'claude' | 'openai' | 'local' | null;
    /** Soft-delete entries older than N sprints (default: 20) */
    decay_after_sprints?: number;
    /** Export .md snapshots from DB (default: true) */
    export_md?: boolean;
    /** When to trigger export (default: 'sprint_end') */
    export_trigger?: 'sprint_end' | 'every_write' | 'manual';
    /** User-defined entry types beyond built-in ones */
    custom_types?: string[];
    /** i18n keyword aliases for cross-language search */
    keyword_aliases?: Record<string, string[]>;
  };

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
  /** @deprecated Use `coverage_aspirational` (auto-learn target) +
   *  `coverage_hard_floor` (immutable EVALUATE gate) instead.
   *  When set, this value is mapped to `coverage_aspirational` on load
   *  for backward compatibility. */
  coverage_threshold?: number;
  /** Immutable coverage floor used by the EVALUATE gate (default: 50).
   *  Finalizer auto-learn never lowers `coverage_aspirational` below
   *  this value. Sprint 179 W2-4. */
  coverage_hard_floor?: number;
  /** Auto-learn coverage target (default: 90). Lowered by finalizer
   *  when recent avg coverage falls below it, but clamped at
   *  `coverage_hard_floor`. Sprint 179 W2-4. */
  coverage_aspirational?: number;
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
  /** How many terminal tasks (DONE/NO_GO) before writing a checkpoint. Default: 5. */
  sprint_checkpoint_interval?: number;

  // ─── Plugin Security ──────────────────────────────────────────────
  /** Require valid SHA-256 signature for plugin hook modules (default: false).
   *  When true, unsigned plugins are rejected. When false, they emit a warning. */
  plugin_require_signature?: boolean;

  // ─── Timeout ───────────────────────────────────────────────────────
  /** Unified timeout configuration for all backends */
  timeout?: Partial<TimeoutConfig>;

  // ─── Observability ──────────────────────────────────────────────────
  /** Observability configuration: metrics rotation, archiving, sprintId tagging */
  observability?: {
    rotation?: {
      /** Max size in MB before auto-rotate (default: 1) */
      maxSizeMB?: number;
      /** Archive format (default: 'gzip') */
      archiveFormat?: 'gzip';
      /** Keep last N archived files (default: 10) */
      keepLastN?: number;
    };
  };

  // ─── Sprint File Retention ───────────────────────────────────────────
  /** Retention policy for sprint-prefixed files in .deckent/ (events, checkpoints, gates, pre-archives).
   *  Hybrid strategy: keep_last_n + size_cap_mb — whichever triggers first wins. */
  sprint_file_retention?: Partial<SprintFileRetentionConfig>;

  // ─── Nervous System ─────────────────────────────────────────────────
  /** Proactive meta-orchestrator nervous system configuration (Sprint 147+) */
  nervous_system?: NervousSystemConfig;

  // ─── Autonomous Engine ──────────────────────────────────────────────
  /** Autonomous execution engine configuration (Sprint 226 — Task 7). Default-disabled. */
  autonomous?: {
    /** Enable autonomous engine (default: false — flag-gated, ADR-040). */
    enabled: boolean;
    /** Idle-tick interval in ms (default: 5000). */
    interval_ms?: number;
    /** Path to backlog.json relative to project root (default: '.deckent/autonomous/backlog.json'). */
    backlog_path?: string;
    /** Max concurrent autonomous executions (default: 1 — serial). */
    pool_size?: number;
    /** Reactive trigger sub-block (flag-gated, default-off). Sprint autonomous-reactive. */
    reactive?: {
      /** Enable reactive trigger bridge (default: false). */
      enabled: boolean;
      /** Path to the reactive trigger map JSON, relative to project root. */
      map_path?: string;
    };
  };

  // ─── Runtime Style ─────────────────────────────────────────────────
  /** Active runtime style — sprint (developer orchestration) or task (one-shot life assistant) */
  deckent_style?: 'sprint' | 'task';

  // ─── Terminal ──────────────────────────────────────────────────────
  /** Embedded web terminal configuration (Sprint 175). */
  terminal?: TerminalConfig;

  // ─── Prompt Generation (Sprint 182 PQ-5 / F7) ──────────────────────
  /** Worker prompt generation tuning. */
  prompt?: PromptConfig;
}

/** Worker prompt generation tuning (Sprint 182 PQ-5 / F7). */
export interface PromptConfig {
  /**
   * Minimum ADR relevance score required to include an ADR in the worker
   * prompt's mandatory rules block. ADRs whose computed score falls below
   * this threshold are dropped; if every selected ADR is filtered out the
   * entire `=== Mandatory Architecture Rules (ADR) ===` block is omitted
   * (no empty header). Default: 0.3 (lenient).
   */
  adr_min_relevance?: number;
}

// ─── Nervous System Config Types ────────────────────────────────────

/** Authority mode for Nervous System — controls how autonomously it acts */
export type NervousAuthorityMode = 'strict' | 'balanced' | 'autopilot' | 'full-auto';

/** Severity levels for Nervous System notifications */
export type NervousSeverityMin = 'info' | 'warning' | 'critical' | 'emergency';

/** Approval policy types */
export type NervousApprovalPolicy = 'autonomous' | 'suggest-30m' | 'suggest-5m' | 'approve';

/** Safety floor locked actions — never auto-executed */
export type NervousSafetyFloorAction =
  | 'KILL_LIVE_SPRINT'
  | 'MANUAL_FILE_DELETE'
  | 'COST_OVER_THRESHOLD'
  | 'DESTRUCTIVE_GIT'
  | 'ADR_DEPRECATE_ACCEPTED';

/** Individual detector configuration */
export interface NervousDetectorConfig {
  /** Whether this detector is active */
  enabled: boolean;
  /** Stale worker threshold in ms (stale_worker only) */
  threshold_ms?: number;
  /** Debt trend rate threshold 0-1 (debt_trend only) */
  threshold_rate?: number;
  /** Agent routing anomaly threshold 0-1 (agent_routing only) */
  anomaly_threshold?: number;
  /** Auto-restore DIRECTIVES.md on corruption (directives_protection only) */
  auto_restore?: boolean;
  /** Reserved for future sprint (reserve detectors only) */
  reserve_for?: string;
}

/** Full Nervous System configuration schema */
export interface NervousSystemConfig {
  /** Enable nervous system (default: false — Sprint 148 will set true) */
  enabled: boolean;
  /** Authority mode preset (default: 'balanced') */
  mode: NervousAuthorityMode;
  /** Per-action policy overrides — override preset for specific actions */
  actionOverrides: Record<string, NervousApprovalPolicy>;
  /** Safety floor configuration */
  safety_floor: {
    /** Actions that require explicit user approval even in full-auto mode */
    locked_actions: NervousSafetyFloorAction[];
    /** Cost threshold in USD — COST_OVER_THRESHOLD triggers above this */
    cost_threshold_usd: number;
    /** Whether safety floor can be bypassed (always false — code-locked) */
    bypass_allowed: boolean;
  };
  /** Notification channel and throttle configuration */
  notifications: {
    /** Output channels */
    channels: {
      mcp: boolean;
      cli: boolean;
      file: boolean;
      desktop: boolean;
    };
    /** Minimum ms between same-group notifications */
    throttle_ms: number;
    /** Window for grouping info notifications (ms) */
    group_info_window_ms: number;
    /** Minimum severity level to surface notifications */
    severity_min: NervousSeverityMin;
    /** Quiet hours — no non-critical notifications in this window */
    quiet_hours: {
      start: string;   // "HH:MM" format
      end: string;     // "HH:MM" format
      timezone: string;
    };
    /** Deduplicate notification across channels by ID */
    cross_channel_dedup: boolean;
  };
  /** Per-detector configuration — Sprint 180 W0: 16 detectors (3 Faz-1 active + 13 reserved/optional).
   *  Sprint 165'te dead_event_stream kod hazır → reserve_for kaldırıldı.
   *  Sprint 180 W0 (NERVOUS-TODO §11.2 Step F): 6 yeni detector default enabled:false. */
  detectors: {
    stale_worker: NervousDetectorConfig;
    scope_collision: NervousDetectorConfig;
    debt_trend: NervousDetectorConfig;
    agent_routing: NervousDetectorConfig;
    directives_protection: NervousDetectorConfig;
    dead_event_stream: NervousDetectorConfig;
    cost_threshold: NervousDetectorConfig;
    prompt_quality: NervousDetectorConfig;
    worker_output_variance: NervousDetectorConfig;
    self_modifying_warner: NervousDetectorConfig;
    task_mode_idle: NervousDetectorConfig;
    build_failure_recurrence: NervousDetectorConfig;
    token_spike: NervousDetectorConfig;
    agent_routing_anomaly: NervousDetectorConfig;
    scope_collision_rate: NervousDetectorConfig;
    notification_delivery_health: NervousDetectorConfig;
  };
  /** Retention for history JSONL file in days */
  history_retention_days: number;
}

/** Configuration for sprint-prefixed file retention in .deckent/ directory.
 *  Hybrid strategy: keep_last_n sprints + size_cap_mb — whichever triggers first.
 *  Files beyond retention window are archived to archive_path/<sprint-id>/. */
export interface SprintFileRetentionConfig {
  /** Number of most-recent sprints to keep in .deckent/ root (default: 10) */
  keep_last_n: number;
  /** Maximum total size in MB for sprint files before oldest are archived (default: 500) */
  size_cap_mb: number;
  /** Archive destination path relative to project root (default: '.deckent/archive/sprints/') */
  archive_path: string;
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
  /** Outbound messaging connectors (BOT-001, §4G) — passed through from project config, tokens .deck-resolved. */
  notify_connectors?: DeckentConfig['notify_connectors'];
  /** Notify on sprint completion (passed through). */
  notify_on_complete?: boolean;
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
  /** @deprecated Use `coverage_aspirational` + `coverage_hard_floor`.
   *  Retained on ResolvedConfig as the resolved aspirational value
   *  (mirrors `coverage_aspirational`) so legacy consumers keep working. */
  coverage_threshold: number;
  /** Immutable EVALUATE gate floor (Sprint 179 W2-4, default: 50).
   *  Optional on the type to keep existing ResolvedConfig literals valid;
   *  `loadConfig`/`mergeConfigs` always populate it via `resolveCoverageGates`.
   *  Consumers should `?? 50` defensively. */
  coverage_hard_floor?: number;
  /** Auto-learn aspirational coverage target (Sprint 179 W2-4, default: 90).
   *  Optional on the type — see `coverage_hard_floor` note. */
  coverage_aspirational?: number;
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
  /** How many terminal tasks (DONE/NO_GO) must complete before a checkpoint is written.
   * Lower values → more frequent checkpoints → safer for long sprints.
   * Default: 5. Sprint 139 override: 3. */
  sprint_checkpoint_interval?: number;
  /** Resolved timeout configuration (always populated from defaults + overrides) */
  timeout?: TimeoutConfig;
  /** Nervous system configuration (passed through from DeckentConfig) */
  nervous_system?: NervousSystemConfig;
  /** Autonomous engine configuration (passed through from DeckentConfig). Default-disabled. */
  autonomous?: DeckentConfig['autonomous'];
  /** Observability configuration (passed through from DeckentConfig) */
  observability?: DeckentConfig['observability'];
  /** Resolved runtime style — always 'sprint' or 'task' */
  deckent_style: 'sprint' | 'task';
  /** Resolved embedded web terminal configuration. Mirrors the `model_strategy`
   * optional-on-both-sides pattern: optional on the type, runtime-populated by
   * `loadConfig`/`mergeConfigs` (DEFAULT_TERMINAL_CONFIG) so consumers can rely
   * on it being present without forcing every ResolvedConfig literal to spell
   * it out. Sprint 175. */
  terminal?: TerminalConfig;
  /** Resolved worker prompt generation tuning (Sprint 182 PQ-5 / F7).
   *  Same optional-on-both-sides pattern as `terminal`; `loadConfig`/`mergeConfigs`
   *  always populate it with DEFAULT_PROMPT_CONFIG. Consumers may rely on it. */
  prompt?: PromptConfig;
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
