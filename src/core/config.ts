import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  PROJECT_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_LANGUAGE,
  DEFAULT_MODE,
  DECKENT_VERSION,
  SUPPORTED_LANGUAGES,
} from './constants.js';
import { readJsonSafeAsync } from './utils.js';
import { needsMigration, migrateConfig, removeDuplicateKeys } from './config-migration.js';
import type {
  AutoDocsConfig,
  DeckentConfig,
  PlanMode,
  PlanModeConfig,
  ResolvedConfig,
  SystemProfile,
  TerminalConfig,
  TimeoutConfig,
} from './types.js';
import { ALL_MODELS, PROVIDER_MODEL_MAP } from './types.js';
import type { ProviderName } from './types.js';
import { MODE_PRESETS } from './mode-presets.js';
import type { ModelStrategy } from './mode-presets.js';
import { metric } from './observability.js';
import { interpolateConfig } from './deck-interpolation.js';

/**
 * Local intersection alias bridging the `dependency_pipeline_enabled` flag,
 * which is declared on `ResolvedConfig` (config-types.ts) but is not yet a
 * member of `DeckentConfig`. Used by createDefaultConfig/loadConfig/mergeConfigs
 * to flip the default to `true` without modifying the shared type file.
 *
 * Sprint 156 Task 2: default flipped false → true to activate the dependency
 * pipeline (wave-based spawning + cascade NO_GO + unblock DONE) by default.
 * Sprint 169 Task 9 (H5 GA anchor): confirmed production default — ADR-045
 * (Wave-Based Execution Semantics) governs this flag. Rollback path: set
 * `dependency_pipeline_enabled: false` in .deckent/config.json.
 * A follow-up sprint should add `dependency_pipeline_enabled` to `DeckentConfig`
 * directly and remove this alias.
 */
type DeckentConfigWithPipeline = DeckentConfig & { dependency_pipeline_enabled?: boolean };

// ─── Default Timeout Config ─────────────────────────────────────────
export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig = {
  docker_min_timeout: 1200,
  docker_max_timeout: 7200,
  tmux_min_timeout: 900,
  tmux_max_timeout: 5400,
  subprocess_min_timeout: 600,
  subprocess_max_timeout: 3600,
  effort_base: { low: 600, normal: 1200, high: 2400 },
  loc_scaling_enabled: true,
  history_scaling_enabled: true,
  runtime_extension_enabled: false,
};

// ─── Default Auto Docs Config ───────────────────────────────────────
export const DEFAULT_AUTO_DOCS: AutoDocsConfig = {
  tier1: true,
  tier2: false,
  tier3: false,
};

// ─── Default Terminal Config ────────────────────────────────────────
// Single source of truth for embedded web terminal defaults (Sprint 175).
// Mirrors the DEFAULT_TIMEOUT_CONFIG / DEFAULT_AUTO_DOCS pattern: one named
// const, structuredClone()'d at each use-site to keep instances independent.
export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  enabled: true,
  bind: '127.0.0.1',
  maxSessions: 10,
  idleTimeoutMs: 1_800_000,
  scrollbackBytes: 262_144,
  allowShellKind: true,
};

// ─── Mode Aliases ────────────────────────────────────────────────────

/**
 * User-friendly aliases for canonical plan mode names.
 * Accepted in config.mode and --mode CLI flag.
 */
export const MODE_ALIASES: Readonly<Record<string, PlanMode>> = {
  // Legacy aliases → new canonical names
  max_plan: 'performance',
  max5x_plan: 'balanced',
  pro_plan: 'economic',
  unlimited: 'api',
} as const;

/**
 * Resolve a mode string (alias or canonical) to a canonical PlanMode name.
 * Returns the input as-is when it is already canonical or unknown.
 */
export function resolveMode(mode: string): string {
  return MODE_ALIASES[mode] ?? mode;
}

// ─── Default Mode Definitions (Blueprint 13) ────────────────────────

const VALID_MODES: readonly PlanMode[] = ['performance', 'balanced', 'economic', 'api'] as const;
const VALID_MODELS = ALL_MODELS;
const VALID_BRAIN_PLANNING = ['ai', 'structured', 'auto'] as const;

/** All valid provider names */
export const VALID_PROVIDERS: readonly ProviderName[] = Object.keys(PROVIDER_MODEL_MAP) as ProviderName[];

/**
 * Default mode definitions derived from MODE_PRESETS (single source of truth).
 * max_workers comes from MODE_PRESETS; model names are v1 backward-compat layer.
 *
 * Sprint 150: Consolidated — mode-presets.ts is the canonical source for max_workers.
 * Brain/default model names kept for PlanModeConfig backward compat.
 */
export const DEFAULT_MODES: Record<string, PlanModeConfig> = {
  performance: {
    max_workers: MODE_PRESETS['performance']!.max_workers,
    brain_model: 'opus',
    default_model: 'opus',
    haiku_allowed: true,
    brain_planning: 'auto',
  },
  balanced: {
    max_workers: MODE_PRESETS['balanced']!.max_workers,
    brain_model: 'sonnet',
    default_model: 'opus',
    haiku_allowed: true,
    brain_planning: 'auto',
  },
  economic: {
    max_workers: MODE_PRESETS['economic']!.max_workers,
    brain_model: 'sonnet',
    default_model: 'sonnet',
    haiku_allowed: false,
    brain_planning: 'auto',
  },
  api: {
    max_workers: MODE_PRESETS['api']!.max_workers,
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: true,
    budget_per_sprint: 5.0,
    requires: 'ANTHROPIC_API_KEY',
    brain_planning: 'auto',
  },
};

// ─── Config Validation Error ─────────────────────────────────────────

export class ConfigValidationError extends Error {
  public readonly errors: string[];

  constructor(errors: string[]) {
    super(`Config validation failed:\n  - ${errors.join('\n  - ')}`);
    this.name = 'ConfigValidationError';
    this.errors = errors;
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Deep-merge two plain objects, returning a new object with all keys from base
 * overridden by non-undefined keys from override. Nested objects are merged recursively.
 * @param base - The base object to start from
 * @param override - Partial override whose values take precedence
 * @returns A new deep-cloned object with merged values
 */
export function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = structuredClone(base);
  // safe: generic T is always a plain object type; Record view needed for dynamic key iteration
  const resultObj = result as Record<string, unknown>;
  const overrideObj = override as Record<string, unknown>;

  for (const key of Object.keys(overrideObj)) {
    const overrideVal = overrideObj[key];
    if (overrideVal === undefined) continue;

    const baseVal = resultObj[key];
    if (isPlainObject(baseVal) && isPlainObject(overrideVal)) {
      resultObj[key] = deepMerge(baseVal, overrideVal);
    } else {
      resultObj[key] = structuredClone(overrideVal);
    }
  }

  return result;
}

/**
 * Validate a complete DeckentConfig object against all known rules.
 * Checks mode validity, language support, worker counts, model names,
 * brain planning mode, and skills config.
 * @param config - The full configuration object to validate
 * @returns Array of warning strings (non-fatal); empty if no warnings
 * @throws {ConfigValidationError} When validation errors are found
 */
export function validateConfig(config: DeckentConfig): string[] {
  const errors: string[] = [];
  const maxWorkersWarnings: string[] = [];

  if (!VALID_MODES.includes(config.mode)) {
    errors.push(`Invalid value '${config.mode}' for field 'mode'. Valid options: performance, balanced, economic, api (legacy: max_plan, max5x_plan, pro_plan)`);
  }

  if (config.language !== undefined && !(SUPPORTED_LANGUAGES as readonly string[]).includes(config.language)) {
    errors.push(`Invalid value '${config.language}' for field 'language'. Valid options: ${SUPPORTED_LANGUAGES.join(', ')}`);
  }

  for (const modeName of VALID_MODES) {
    const mc = config.modes[modeName];
    if (!mc) {
      errors.push(`Missing mode config for "${modeName}"`);
      continue;
    }

    const prefix = `modes.${modeName}`;

    if (mc.max_workers === 'auto') {
      // 'auto' is valid — resolved at runtime
    } else if (typeof mc.max_workers !== 'number' || mc.max_workers < 1 || mc.max_workers > 100) {
      errors.push(`${prefix}.max_workers must be a number between 1 and 100, or 'auto'`);
    } else if (mc.max_workers >= 20) {
      // Warning only — collected separately, not as error
      maxWorkersWarnings.push(`${prefix}.max_workers is ${mc.max_workers} (>=20) — high worker count may cause resource contention`);
    }

    if (!(VALID_MODELS as readonly string[]).includes(mc.brain_model)) {
      errors.push(`Invalid value '${mc.brain_model}' for field '${prefix}.brain_model'. Valid: ${VALID_MODELS.join(', ')}`);
    }

    if (!(VALID_MODELS as readonly string[]).includes(mc.default_model)) {
      errors.push(`Invalid value '${mc.default_model}' for field '${prefix}.default_model'. Valid: ${VALID_MODELS.join(', ')}`);
    }

    if (typeof mc.haiku_allowed !== 'boolean') {
      errors.push(`${prefix}.haiku_allowed must be a boolean`);
    }

    if (mc.brain_planning !== undefined &&
        !(VALID_BRAIN_PLANNING as readonly string[]).includes(mc.brain_planning)) {
      errors.push(`Invalid value '${mc.brain_planning}' for field '${prefix}.brain_planning'. Valid: ${VALID_BRAIN_PLANNING.join(', ')}`);
    }

    if (modeName === 'api' && mc.budget_per_sprint !== undefined) {
      if (typeof mc.budget_per_sprint !== 'number' || mc.budget_per_sprint <= 0) {
        errors.push(`${prefix}.budget_per_sprint must be a positive number`);
      }
    }
  }

  // ─── Skills config validation ───────────────────────────────────────
  if (config.skills !== undefined) {
    const skills = config.skills;
    if (typeof skills !== 'object' || skills === null || Array.isArray(skills)) {
      errors.push('skills must be an object');
    } else {
      if (skills.enabled !== undefined && typeof skills.enabled !== 'boolean') {
        errors.push('skills.enabled must be a boolean');
      }
      if (skills.maxPerTask !== undefined) {
        if (typeof skills.maxPerTask !== 'number' || skills.maxPerTask < 1 || skills.maxPerTask > 10) {
          errors.push('skills.maxPerTask must be a number between 1 and 10');
        }
      }
      if (skills.autoDetectStack !== undefined && typeof skills.autoDetectStack !== 'boolean') {
        errors.push('skills.autoDetectStack must be a boolean');
      }
      if (skills.preferredSkills !== undefined) {
        if (!Array.isArray(skills.preferredSkills)) {
          errors.push('skills.preferredSkills must be an array of strings');
        } else {
          for (const item of skills.preferredSkills) {
            if (typeof item !== 'string') {
              errors.push('skills.preferredSkills must be an array of strings');
              break;
            }
          }
        }
      }
    }
  }

  // ─── Provider config validation ─────────────────────────────────────
  if (config.brain_provider !== undefined &&
      !(VALID_PROVIDERS as readonly string[]).includes(config.brain_provider)) {
    errors.push(`Invalid value '${config.brain_provider}' for field 'brain_provider'. Valid: ${VALID_PROVIDERS.join(', ')}`);
  }

  if (config.worker_provider !== undefined &&
      !(VALID_PROVIDERS as readonly string[]).includes(config.worker_provider)) {
    errors.push(`Invalid value '${config.worker_provider}' for field 'worker_provider'. Valid: ${VALID_PROVIDERS.join(', ')}`);
  }

  if (config.fallback_provider !== undefined &&
      !(VALID_PROVIDERS as readonly string[]).includes(config.fallback_provider)) {
    errors.push(`Invalid value '${config.fallback_provider}' for field 'fallback_provider'. Valid: ${VALID_PROVIDERS.join(', ')}`);
  }

  if (config.provider_overrides !== undefined) {
    if (typeof config.provider_overrides !== 'object' || config.provider_overrides === null || Array.isArray(config.provider_overrides)) {
      errors.push('provider_overrides must be an object');
    } else {
      for (const [key, value] of Object.entries(config.provider_overrides)) {
        if (!(VALID_PROVIDERS as readonly string[]).includes(value)) {
          errors.push(`Invalid provider "${value}" in provider_overrides["${key}"]. Must be one of: ${VALID_PROVIDERS.join(', ')}`);
        }
      }
    }
  }

  if (config.cost_optimization !== undefined && typeof config.cost_optimization !== 'boolean') {
    errors.push('cost_optimization must be a boolean');
  }

  if (config.api_keys !== undefined) {
    if (typeof config.api_keys !== 'object' || config.api_keys === null || Array.isArray(config.api_keys)) {
      errors.push('api_keys must be an object');
    }
  }

  // ─── Memory config validation ──────────────────────────────────────
  if (config.memory_budget !== undefined) {
    if (typeof config.memory_budget !== 'number' || config.memory_budget < 100 || config.memory_budget > 10000) {
      errors.push('memory_budget must be a number between 100 and 10000');
    }
  }

  if (config.decay_after_sprints !== undefined) {
    if (typeof config.decay_after_sprints !== 'number' || config.decay_after_sprints < 1 || config.decay_after_sprints > 100) {
      errors.push('decay_after_sprints must be a number between 1 and 100');
    }
  }

  if (config.patterns_enabled !== undefined && typeof config.patterns_enabled !== 'boolean') {
    errors.push('patterns_enabled must be a boolean');
  }

  if (config.project_identity_enabled !== undefined && typeof config.project_identity_enabled !== 'boolean') {
    errors.push('project_identity_enabled must be a boolean');
  }

  // ─── Auditor config validation ─────────────────────────────────────
  if (config.scan_interval !== undefined) {
    if (typeof config.scan_interval !== 'number' || config.scan_interval < 5 || config.scan_interval > 600) {
      errors.push('scan_interval must be a number between 5 and 600');
    }
  }

  if (config.heartbeat_timeout !== undefined) {
    if (typeof config.heartbeat_timeout !== 'number' || config.heartbeat_timeout < 30 || config.heartbeat_timeout > 600) {
      errors.push('heartbeat_timeout must be a number between 30 and 600');
    }
  }

  if (config.lock_stale_threshold !== undefined) {
    if (typeof config.lock_stale_threshold !== 'number' || config.lock_stale_threshold < 30 || config.lock_stale_threshold > 3600) {
      errors.push('lock_stale_threshold must be a number between 30 and 3600');
    }
  }

  if (config.boundary_enforcement !== undefined && typeof config.boundary_enforcement !== 'boolean') {
    errors.push('boundary_enforcement must be a boolean');
  }

  // ─── Sprint config validation ──────────────────────────────────────
  if (config.fix_phase_enabled !== undefined && typeof config.fix_phase_enabled !== 'boolean') {
    errors.push('fix_phase_enabled must be a boolean');
  }

  if (config.max_fix_retries !== undefined) {
    if (typeof config.max_fix_retries !== 'number' || config.max_fix_retries < 0 || config.max_fix_retries > 10) {
      errors.push('max_fix_retries must be a number between 0 and 10');
    }
  }

  // ─── Rollback config validation ────────────────────────────────────
  if (config.rollback_policy !== undefined) {
    const validPolicies = ['never', 'on_failure', 'always'] as const;
    if (!(validPolicies as readonly string[]).includes(config.rollback_policy)) {
      errors.push(`Invalid value '${config.rollback_policy}' for field 'rollback_policy'. Valid: ${validPolicies.join(', ')}`);
    }
  }

  // ─── Timeout config validation ─────────────────────────────────────
  if (config.timeout !== undefined) {
    const t = deepMerge(DEFAULT_TIMEOUT_CONFIG, config.timeout as Partial<TimeoutConfig>);

    // effort_base ordering: high > normal > low
    if (t.effort_base.high <= t.effort_base.normal) {
      errors.push('timeout.effort_base.high must be greater than effort_base.normal');
    }
    if (t.effort_base.normal <= t.effort_base.low) {
      errors.push('timeout.effort_base.normal must be greater than effort_base.low');
    }

    // per-backend min >= 300
    const minFields = ['docker_min_timeout', 'tmux_min_timeout', 'subprocess_min_timeout'] as const;
    for (const field of minFields) {
      if (t[field] < 300) {
        errors.push(`timeout.${field} must be >= 300`);
      }
    }

    // per-backend max <= 14400
    const maxFields = ['docker_max_timeout', 'tmux_max_timeout', 'subprocess_max_timeout'] as const;
    for (const field of maxFields) {
      if (t[field] > 14400) {
        errors.push(`timeout.${field} must be <= 14400`);
      }
    }

    // max > min consistency per backend
    const backends = ['docker', 'tmux', 'subprocess'] as const;
    for (const backend of backends) {
      const minKey = `${backend}_min_timeout` as keyof TimeoutConfig;
      const maxKey = `${backend}_max_timeout` as keyof TimeoutConfig;
      if ((t[maxKey] as number) <= (t[minKey] as number)) {
        errors.push(`timeout.${maxKey} must be greater than timeout.${minKey}`);
      }
    }
  }

  // ─── Nervous System validation ─────────────────────────────────────
  if (config.nervous_system !== undefined) {
    const ns = config.nervous_system;
    const validNsModes = ['strict', 'balanced', 'autopilot', 'full-auto'] as const;
    if (!(validNsModes as readonly string[]).includes(ns.mode)) {
      errors.push(`Invalid value '${ns.mode}' for field 'nervous_system.mode'. Valid: ${validNsModes.join(', ')}`);
    }
    if (ns.notifications?.throttle_ms !== undefined && ns.notifications.throttle_ms < 0) {
      errors.push('nervous_system.notifications.throttle_ms must be >= 0');
    }
    if (ns.detectors !== undefined) {
      const sw = ns.detectors.stale_worker;
      if (sw?.threshold_ms !== undefined && sw.threshold_ms < 0) {
        errors.push('nervous_system.detectors.stale_worker.threshold_ms must be >= 0');
      }
      const dt = ns.detectors.debt_trend;
      if (dt?.threshold_rate !== undefined && (dt.threshold_rate < 0 || dt.threshold_rate > 1)) {
        errors.push('nervous_system.detectors.debt_trend.threshold_rate must be between 0 and 1');
      }
      const ar = ns.detectors.agent_routing;
      if (ar?.anomaly_threshold !== undefined && (ar.anomaly_threshold < 0 || ar.anomaly_threshold > 1)) {
        errors.push('nervous_system.detectors.agent_routing.anomaly_threshold must be between 0 and 1');
      }
    }
    if (ns.history_retention_days !== undefined && ns.history_retention_days < 1) {
      errors.push('nervous_system.history_retention_days must be >= 1');
    }
  }

  // ─── deckent_style validation ───────────────────────────────────────
  if (config.deckent_style !== undefined && !['sprint', 'task'].includes(config.deckent_style)) {
    errors.push(`Invalid value '${config.deckent_style}' for field 'deckent_style'. Valid options: sprint, task`);
  }

  // ─── Routing Engine validation ──────────────────────────────────────
  if (config.routing_engine !== undefined) {
    const validRoutingEngines = ['v1', 'v2'] as const;
    if (!(validRoutingEngines as readonly string[]).includes(config.routing_engine)) {
      errors.push(`Invalid value '${config.routing_engine}' for field 'routing_engine'. Valid: ${validRoutingEngines.join(', ')}`);
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }

  return maxWorkersWarnings;
}

// ─── Worker Resolution ───────────────────────────────────────────────

/**
 * Resolves the effective number of workers to spawn.
 * - 'auto': uses systemProfile.recommendedMaxWorkers, capped by an optional plan_limit
 * - number: returns the configured value directly
 */
export function resolveEffectiveWorkers(
  config: ResolvedConfig,
  systemProfile: SystemProfile,
  planLimit?: number,
): number {
  const maxWorkers = config.activeModeConfig.max_workers;
  if (maxWorkers === 'auto') {
    const recommended = systemProfile.recommendedMaxWorkers;
    return planLimit !== undefined ? Math.min(recommended, planLimit) : recommended;
  }
  return maxWorkers;
}

// ─── File Reading ────────────────────────────────────────────────────

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  return readJsonSafeAsync<T>(filePath);
}

// ─── Config Cache ───────────────────────────────────────────────────
let cachedConfig: ResolvedConfig | null = null;
let cacheStamp: number = 0;
let cachedProjectRoot: string | null = null;

/**
 * Clear the module-level config cache. Useful for testing.
 */
export function clearConfigCache(): void {
  cachedConfig = null;
  cacheStamp = 0;
  cachedProjectRoot = null;
}

/**
 * Get the mtime of the project config file, or 0 if the file does not exist.
 */
function getConfigMtime(projectRoot: string): number {
  const configPath = join(projectRoot, PROJECT_CONFIG_PATH);
  try {
    return statSync(configPath).mtimeMs;
  } catch {
    return 0;
  }
}

// ─── Public API ──────────────────────────────────────────────────────

/**
 * Create a fresh default DeckentConfig with default mode and mode definitions.
 * @returns A new DeckentConfig instance with default values
 */
export function createDefaultConfig(): DeckentConfig {
  const config: DeckentConfigWithPipeline = {
    mode: DEFAULT_MODE,
    modes: structuredClone(DEFAULT_MODES),
    // Provider (Sprint 150 Decision 4 — grouped `providers` is canonical; flat keys deprecated)
    providers: { brain: 'claude', worker: 'claude' },
    provider_overrides: undefined,
    cost_optimization: false,
    // claude_backend removed (Sprint 150 Decision 3 — use spawn_backend instead)
    auth_mode: 'subscription',
    // Human Checkpoints (empty = fully autonomous)
    human_checkpoints: [],
    // Sprint
    fix_phase_enabled: true,
    max_fix_retries: 2,
    coverage_threshold: 90,
    max_reroutes: 3,
    reroute_on_tech_debt: false,
    sprint_timeout_minutes: 0,
    // Memory
    memory_budget: 5000, // Sprint 140 pre-flight: 900→5000 (Self-Analysis Ayna Sprint)
    decay_after_sprints: 20, // Sprint 140 pre-flight: 5→20 (self-analysis raporları hemen silinmesin)
    patterns_enabled: true,
    project_identity_enabled: true,
    // Auditor
    scan_interval: 30,
    heartbeat_timeout: 120,
    boundary_enforcement: true,
    lock_stale_threshold: 300,
    // Skill-Based Provider Routing
    skill_routing: undefined,
    // Search & Documentation
    search_enabled: true,
    search_provider: 'context7',
    search_cache_ttl: 3600,
    // Notifications
    notify_on_complete: false,
    notify_channel: null,
    notify_url: null,
    // Telemetry
    telemetry_enabled: false,
    telemetry_anonymous: true,
    // Environment Detection
    detected_env: null,
    multi_ide_mode: false,
    // Output & Display
    output_splash: true,
    output_mode: 'normal',
    output_theme: 'default',
    // Rollback
    rollback_policy: 'never',
    // Rubric-Based Evaluation
    evaluation_rubric: undefined,
    rubric_max_retries: 0,
    // Adaptive Thresholds
    adaptive_thresholds: false,
    agent_min_score: 5,
    adaptive_config: { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    // Routing Engine v2 (default since sprint-067)
    routing_engine: 'v2',
    // Cleanup delay: wait before deleting .tasks/ files (ms)
    cleanup_delay_ms: 180_000,
    /**
     * Dependency pipeline enabled.
     *
     * Sprint 156 Task 2 — default flipped false → true.
     * Sprint 169 Task 9 (H5 GA anchor) — confirmed production default per ADR-045
     * (Wave-Based Execution Semantics). Wave-based spawning is the standard runtime.
     * Rollback: set `dependency_pipeline_enabled: false` in .deckent/config.json.
     * When true, sprint-spawner.ts uses wave-based spawning, applies
     * cascade-on-NO_GO (dependents → PAUSED) and unblock-on-DONE (dependents → PENDING).
     * Race conditions in DIRECTIVES with explicit `dependencies` are eliminated.
     * Cast via DeckentConfigWithPipeline because the field is declared on
     * ResolvedConfig but not yet on DeckentConfig (see alias at top of file).
     */
    dependency_pipeline_enabled: true,
    // Sprint checkpoint interval: how many terminal tasks before writing a checkpoint
    sprint_checkpoint_interval: 5,
    // Timeout
    timeout: structuredClone(DEFAULT_TIMEOUT_CONFIG),
    // Observability (Sprint 150 Task 030 — metrics rotation defaults)
    observability: {
      rotation: {
        maxSizeMB: 1,
        archiveFormat: 'gzip',
        keepLastN: 10,
      },
    },
    // Sprint File Retention (Sprint 150 Task 035 — Hybrid keep_last_n + size_cap_mb)
    sprint_file_retention: {
      keep_last_n: 10,
      size_cap_mb: 500,
      archive_path: '.deckent/archive/sprints/',
    },
    // Runtime Style
    deckent_style: 'sprint',
    // Terminal (Sprint 175 — embedded web terminal)
    terminal: structuredClone(DEFAULT_TERMINAL_CONFIG),
    // Nervous System (disabled by default — Sprint 148 will activate)
    nervous_system: {
      enabled: false,
      mode: 'balanced',
      actionOverrides: {},
      safety_floor: {
        locked_actions: [
          'KILL_LIVE_SPRINT',
          'MANUAL_FILE_DELETE',
          'COST_OVER_THRESHOLD',
          'DESTRUCTIVE_GIT',
          'ADR_DEPRECATE_ACCEPTED',
        ],
        cost_threshold_usd: 110,
        bypass_allowed: false,
      },
      notifications: {
        channels: { mcp: true, cli: true, file: true, desktop: false },
        throttle_ms: 300000,
        group_info_window_ms: 600000,
        severity_min: 'info',
        quiet_hours: { start: '22:00', end: '08:00', timezone: 'TRT' },
        cross_channel_dedup: true,
      },
      detectors: {
        stale_worker: { enabled: true, threshold_ms: 180000 },
        scope_collision: { enabled: true },
        debt_trend: { enabled: true, threshold_rate: 0.15 },
        agent_routing: { enabled: true, anomaly_threshold: 0.40 },
        directives_protection: { enabled: true, auto_restore: true },
        dead_event_stream: { enabled: false, reserve_for: 'sprint-148' },
        cost_threshold: { enabled: false, reserve_for: 'sprint-148' },
        prompt_quality: { enabled: false, reserve_for: 'sprint-148' },
        worker_output_variance: { enabled: false, reserve_for: 'sprint-148' },
        self_modifying_warner: { enabled: false, reserve_for: 'sprint-148' },
      },
      history_retention_days: 30,
    },
  };
  return config;
}

/**
 * Alias for createDefaultConfig. Returns a fresh default configuration.
 * @returns A new DeckentConfig instance with default values
 */
export function getDefaultConfig(): DeckentConfig {
  return createDefaultConfig();
}

/**
 * Get a deep clone of the default mode definitions for all plan modes.
 * @returns A record mapping each PlanMode to its default PlanModeConfig
 */
export function getDefaultModes(): Record<string, PlanModeConfig> {
  return structuredClone(DEFAULT_MODES);
}

/**
 * Load and resolve the full configuration by merging defaults, global config,
 * and project-level config. Resolves mode aliases and validates the result.
 *
 * Results are cached at module level. Cache is invalidated when:
 * - `options.force` is true
 * - The project config file mtime has changed
 * - `DECKENT_CONFIG_RELOAD=1` environment variable is set
 * - A different `projectRoot` is requested
 *
 * @param projectRoot - Project root directory; defaults to process.cwd()
 * @param options - Optional: `{ force: true }` to bypass cache
 * @returns Fully resolved configuration ready for use
 * @throws {ConfigValidationError} When merged config fails validation or API key is missing
 */
export async function loadConfig(projectRoot?: string, options?: { force?: boolean }): Promise<ResolvedConfig> {
  const root = resolve(projectRoot ?? process.cwd());

  // ─── Cache check ────────────────────────────────────────────────────
  const forceReload = options?.force === true || process.env['DECKENT_CONFIG_RELOAD'] === '1';
  if (!forceReload && cachedConfig !== null && cachedProjectRoot === root) {
    const currentMtime = getConfigMtime(root);
    if (currentMtime === cacheStamp) {
      metric('config.cache', 1, { result: 'hit' });
      return cachedConfig;
    }
  }

  let config = createDefaultConfig();

  const globalConfig = await readJsonFile<Partial<DeckentConfig>>(GLOBAL_CONFIG_PATH);
  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }

  const projectConfigPath = join(root, PROJECT_CONFIG_PATH);

  let projectConfig = await readJsonFile<Partial<DeckentConfig>>(projectConfigPath);

  // Self-healing: if readJsonFile returned null but the file exists on disk,
  // it means the JSON is corrupted. Backup + fresh default.
  if (projectConfig === null && existsSync(projectConfigPath)) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupPath = `${projectConfigPath}.corrupted.${timestamp}.bak`;
    try {
      renameSync(projectConfigPath, backupPath);
      const freshDefault = createDefaultConfig();
      writeFileSync(projectConfigPath, JSON.stringify(freshDefault, null, 2) + '\n');
      console.error(
        `[deckent] Config dosyanız bozulmuştu, yedeklendi: ${backupPath}\n` +
        `Defaults ile devam ediliyor. Düzeltme için: deckent config read`,
      );
      projectConfig = freshDefault;
    } catch (backupErr) {
      console.error(`[deckent] Config recovery failed: ${backupErr instanceof Error ? backupErr.message : String(backupErr)}`);
    }
  }

  if (projectConfig) {
    // Sprint 150: Remove duplicate keys before merge (Decision 3+4)
    removeDuplicateKeys(projectConfig as Record<string, unknown>);

    config = deepMerge(config, projectConfig);

    // Auto-migrate: if the project config file is missing fields, update it on disk (non-fatal)
    if (existsSync(projectConfigPath) && needsMigration(projectConfig as Record<string, unknown>)) {
      try {
        migrateConfig(projectConfigPath);
      } catch {
        // Non-fatal: migration failure should not block config load
      }
    }
  }

  // Resolve legacy mode aliases so 'max_plan' → 'performance' etc.
  config.mode = resolveMode(config.mode) as PlanMode;

  // ─── Grouped providers → flat provider fields ──────────────────────
  // Runtime-only projection. Must run BEFORE env var overrides so env vars win.
  // (Sprint 150 Decision 4 — grouped `providers` is canonical in JSON; flat
  //  fields stay available at runtime for backward compatibility.)
  if (config.providers) {
    if (config.providers.brain) config.brain_provider = config.providers.brain;
    if (config.providers.worker) config.worker_provider = config.providers.worker;
    if (config.providers.fallback) config.fallback_provider = config.providers.fallback;
    if (config.providers.overrides) config.provider_overrides = config.providers.overrides;
  }

  // ─── Env var overrides ─────────────────────────────────────────────
  // Env vars override grouped→flat projection above.
  const envBrainProvider = process.env['DECKENT_BRAIN_PROVIDER'];
  if (envBrainProvider) {
    config.brain_provider = envBrainProvider as ProviderName;
  }
  const envWorkerProvider = process.env['DECKENT_WORKER_PROVIDER'];
  if (envWorkerProvider) {
    config.worker_provider = envWorkerProvider as ProviderName;
  }
  const envMode = process.env['DECKENT_MODE'];
  if (envMode) {
    config.mode = resolveMode(envMode) as PlanMode;
  }
  const envLanguage = process.env['DECKENT_LANGUAGE'];
  if (envLanguage) {
    config.language = envLanguage;
  }
  const envDeckentStyle = process.env['DECKENT_STYLE'];
  if (envDeckentStyle) {
    config.deckent_style = envDeckentStyle as 'sprint' | 'task';
  }

  // ─── Mode preset → model_strategy merge ────────────────────────────
  // Start from the mode preset (if any), then overlay user config overrides
  const preset = MODE_PRESETS[config.mode];
  let resolvedModelStrategy: ModelStrategy | undefined;
  if (preset) {
    resolvedModelStrategy = { ...preset.model_strategy };
    if (config.model_strategy) {
      Object.assign(resolvedModelStrategy, config.model_strategy);
    }
  } else if (config.model_strategy) {
    // Custom mode with explicit model_strategy — fill defaults from 'balanced'
    const fallbackPreset = MODE_PRESETS['balanced'];
    if (fallbackPreset) {
      resolvedModelStrategy = { ...fallbackPreset.model_strategy, ...config.model_strategy };
    }
  }

  // ─── haiku_allowed backward compat → min_tier ─────────────────────
  // If min_tier is already set (via model_strategy), it takes precedence.
  // Otherwise, derive from haiku_allowed for backward compatibility.
  for (const modeName of Object.keys(config.modes)) {
    const mc = config.modes[modeName];
    if (mc && mc.min_tier === undefined && mc.haiku_allowed === false) {
      mc.min_tier = 'standard';
    }
  }

  validateConfig(config);

  // Mode is validated above — activeModeConfig is guaranteed to exist
  const activeModeConfig = (config.modes[config.mode] ?? config.modes['performance']) as PlanModeConfig;

  if (config.mode === 'api' && activeModeConfig.requires) {
    const envVar = activeModeConfig.requires;
    if (!process.env[envVar]) {
      throw new ConfigValidationError([
        `API mode requires environment variable "${envVar}" to be set`,
      ]);
    }
  }

  const resolved: ResolvedConfig = {
    mode: config.mode,
    activeModeConfig,
    modes: config.modes,
    language: config.language ?? DEFAULT_LANGUAGE,
    projectName: config.projectName ?? 'deckent-project',
    projectRoot: root,
    version: config.version ?? DECKENT_VERSION,
    model_strategy: resolvedModelStrategy,
    auto_docs: config.auto_docs ?? { ...DEFAULT_AUTO_DOCS },
    spawn_backend: config.spawn_backend,
    docker_image: config.docker_image,
    docker_timeout: config.docker_timeout,
    skills: config.skills,
    brain_provider: config.brain_provider,
    worker_provider: config.worker_provider,
    fallback_provider: config.fallback_provider,
    // Memory
    memory_budget: config.memory_budget,
    decay_after_sprints: config.decay_after_sprints,
    patterns_enabled: config.patterns_enabled,
    project_identity_enabled: config.project_identity_enabled,
    // Auditor
    scan_interval: config.scan_interval,
    heartbeat_timeout: config.heartbeat_timeout,
    boundary_enforcement: config.boundary_enforcement,
    lock_stale_threshold: config.lock_stale_threshold,
    // Human Checkpoints
    human_checkpoints: config.human_checkpoints,
    // Sprint
    fix_phase_enabled: config.fix_phase_enabled,
    max_fix_retries: config.max_fix_retries,
    coverage_threshold: config.coverage_threshold ?? 90,
    max_reroutes: config.max_reroutes ?? 3,
    reroute_on_tech_debt: config.reroute_on_tech_debt ?? false,
    sprint_timeout_minutes: config.sprint_timeout_minutes ?? 0,
    // Adaptive Thresholds
    adaptive_thresholds: config.adaptive_thresholds ?? false,
    agent_min_score: config.agent_min_score ?? 5,
    adaptive_config: config.adaptive_config ?? { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    // Rollback
    rollback_policy: config.rollback_policy,
    // Rubric-Based Evaluation
    evaluation_rubric: config.evaluation_rubric,
    rubric_max_retries: config.rubric_max_retries,
    // Routing Engine v2
    routing_engine: config.routing_engine,
    routing_config: config.routing_config,
    // Cleanup delay
    cleanup_delay_ms: config.cleanup_delay_ms,
    // Dependency pipeline (Sprint 156: default true; user/project config can override)
    dependency_pipeline_enabled:
      (config as DeckentConfigWithPipeline).dependency_pipeline_enabled ?? true,
    // AI planner timeout
    ai_planner_timeout: config.ai_planner_timeout,
    // Sprint checkpoint interval
    sprint_checkpoint_interval: config.sprint_checkpoint_interval,
    // Timeout
    timeout: config.timeout
      ? deepMerge(DEFAULT_TIMEOUT_CONFIG, config.timeout as Partial<TimeoutConfig>)
      : structuredClone(DEFAULT_TIMEOUT_CONFIG),
    // Nervous System — passed through from project config
    nervous_system: config.nervous_system,
    // Runtime Style
    deckent_style: config.deckent_style ?? 'sprint',
    // Terminal (Sprint 175) — deepMerge'd `config` already carries defaults from
    // createDefaultConfig(); fallback is defensive for hot-reload scenarios.
    terminal: config.terminal
      ? deepMerge(DEFAULT_TERMINAL_CONFIG, config.terminal as Partial<TerminalConfig>)
      : structuredClone(DEFAULT_TERMINAL_CONFIG),
  };

  // ─── $DECK: interpolation ────────────────────────────────────────────
  const interpolated = interpolateConfig(resolved, root) as ResolvedConfig;

  // ─── Update cache ───────────────────────────────────────────────────
  cachedConfig = interpolated;
  cacheStamp = getConfigMtime(root);
  cachedProjectRoot = root;

  metric('config.cache', 1, { result: 'miss' });
  return interpolated;
}

/**
 * Read the auth_mode from the merged (global + project) config without full validation.
 * Returns 'subscription' when the config file is missing or auth_mode is not set.
 * @param projectRoot - Project root directory; defaults to process.cwd()
 */
export async function readAuthMode(
  projectRoot?: string,
): Promise<'subscription' | 'api' | 'hybrid'> {
  const root = resolve(projectRoot ?? process.cwd());

  let authMode: 'subscription' | 'api' | 'hybrid' = 'subscription';

  const globalConfig = await readJsonFile<Partial<DeckentConfig>>(GLOBAL_CONFIG_PATH);
  if (globalConfig?.auth_mode) {
    authMode = globalConfig.auth_mode;
  }

  const projectConfigPath = join(root, PROJECT_CONFIG_PATH);
  const projectConfig = await readJsonFile<Partial<DeckentConfig>>(projectConfigPath);
  if (projectConfig?.auth_mode) {
    authMode = projectConfig.auth_mode;
  }

  return authMode;
}

/**
 * Validate a partial config by merging it over defaults and running full validation.
 * Useful for checking user-provided overrides before persisting.
 * @param partial - Partial configuration to validate
 * @throws {ConfigValidationError} When the merged result fails validation
 */
export function validatePartialConfig(partial: Partial<DeckentConfig>): void {
  const merged = deepMerge(createDefaultConfig(), partial);
  validateConfig(merged);
}

// ─── Global Config ───────────────────────────────────────────────────

/**
 * Load a global config file (partial DeckentConfig).
 * Returns null when the file does not exist or contains malformed JSON.
 */
export async function loadGlobalConfig(
  configPath?: string,
): Promise<Partial<DeckentConfig> | null> {
  const cfgPath = configPath ?? GLOBAL_CONFIG_PATH;
  return readJsonFile<Partial<DeckentConfig>>(cfgPath);
}

/**
 * Save a partial config to the global config path.
 * Creates parent directories if needed.
 */
export async function saveGlobalConfig(
  config: Partial<DeckentConfig>,
  configPath?: string,
): Promise<void> {
  const cfgPath = configPath ?? GLOBAL_CONFIG_PATH;
  const dir = dirname(cfgPath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(cfgPath, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

// ─── Config Metadata ─────────────────────────────────────────────────

/** Metadata descriptor for a single config parameter. */
export interface ConfigMetadataEntry {
  description: string;
  type: string;
  default: unknown;
  options?: string[];
  category: string;
  required?: boolean;
}

/**
 * Metadata for every top-level DeckentConfig key.
 * Consumed by `getConfigHelp`, `listConfigByCategory`, and `generateConfigReference`.
 */
export const CONFIG_METADATA: Readonly<Record<string, ConfigMetadataEntry>> = {
  mode: {
    description: 'Active plan mode — controls worker count and model tier.',
    type: "'performance' | 'balanced' | 'economic' | 'api'",
    default: 'balanced',
    options: ['performance', 'balanced', 'economic', 'api'],
    category: 'Sprint',
    required: true,
  },
  modes: {
    description: 'Per-mode configuration overrides (worker count, model, budget).',
    type: 'Record<PlanMode, PlanModeConfig>',
    default: null,
    category: 'Sprint',
  },
  spawn_backend: {
    description: "Worker spawn mechanism: 'docker' (isolated), 'tmux' (interactive), 'subprocess' (headless), 'auto'.",
    type: "'docker' | 'tmux' | 'subprocess' | 'auto'",
    default: undefined,
    options: ['docker', 'tmux', 'subprocess', 'auto'],
    category: 'Sprint',
  },
  docker_timeout: {
    description: 'Docker container timeout in seconds. Workers killed after this duration.',
    type: 'number',
    default: 1200,
    category: 'Sprint',
  },
  brain_provider: {
    description: 'AI provider used for the Brain orchestrator (planning and evaluation).',
    type: "'claude' | 'codex' | 'gemini'",
    default: 'claude',
    options: ['claude', 'codex', 'gemini'],
    category: 'Provider',
  },
  worker_provider: {
    description: 'Default AI provider for worker agents executing tasks.',
    type: "'claude' | 'codex' | 'gemini'",
    default: 'claude',
    options: ['claude', 'codex', 'gemini'],
    category: 'Provider',
  },
  fallback_provider: {
    description: 'Provider to use when the primary provider is unavailable.',
    type: "'claude' | 'codex' | 'gemini' | undefined",
    default: undefined,
    options: ['claude', 'codex', 'gemini'],
    category: 'Provider',
  },
  provider_overrides: {
    description: 'Per-task-type provider overrides, keyed by task type.',
    type: 'Record<string, ProviderName> | undefined',
    default: undefined,
    category: 'Provider',
  },
  cost_optimization: {
    description: 'Automatically select the cheapest capable provider for each task.',
    type: 'boolean',
    default: false,
    options: ['true', 'false'],
    category: 'Provider',
  },
  claude_backend: {
    description: "Claude execution backend: 'tmux' (default), 'subprocess' (headless/CI), 'mcp' (future).",
    type: "'tmux' | 'subprocess' | 'mcp'",
    default: 'tmux',
    options: ['tmux', 'subprocess', 'mcp'],
    category: 'Provider',
  },
  auth_mode: {
    description: "Auth mode: 'subscription' (Claude.ai plan), 'api' (ANTHROPIC_API_KEY), 'hybrid'.",
    type: "'subscription' | 'api' | 'hybrid'",
    default: 'subscription',
    options: ['subscription', 'api', 'hybrid'],
    category: 'Provider',
  },
  api_keys: {
    description: 'Optional API key overrides (prefer environment variables).',
    type: 'Record<string, string> | undefined',
    default: undefined,
    category: 'Provider',
  },
  skills: {
    description: 'Skill system: enabled flag, max skills per task, auto-detection, preferred skills.',
    type: 'SkillConfig | undefined',
    default: undefined,
    category: 'Skills',
  },
  skill_routing: {
    description: 'Route specific skill types (design, testing, docs) to dedicated providers.',
    type: '{ design?: string; testing?: string; docs?: string; default?: string } | undefined',
    default: undefined,
    category: 'Skills',
  },
  search_enabled: {
    description: 'Enable online documentation search during task execution.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Search',
  },
  search_provider: {
    description: "Documentation search provider: 'context7' (curated), 'web' (general), 'none'.",
    type: "'context7' | 'web' | 'none'",
    default: 'context7',
    options: ['context7', 'web', 'none'],
    category: 'Search',
  },
  search_cache_ttl: {
    description: 'How long to cache search results in seconds (default: 3600; 0 = no cache).',
    type: 'number',
    default: 3600,
    category: 'Search',
  },
  notify_on_complete: {
    description: 'Send a notification when a sprint finishes.',
    type: 'boolean',
    default: false,
    options: ['true', 'false'],
    category: 'Notifications',
  },
  notify_channel: {
    description: 'Notification delivery channel.',
    type: "'slack' | 'discord' | 'email' | 'webhook' | null",
    default: null,
    options: ['slack', 'discord', 'email', 'webhook'],
    category: 'Notifications',
  },
  notify_url: {
    description: 'Webhook URL for slack/discord/webhook notification channels.',
    type: 'string | null',
    default: null,
    category: 'Notifications',
  },
  telemetry_enabled: {
    description: 'Send anonymous usage telemetry to help improve Deckent.',
    type: 'boolean',
    default: false,
    options: ['true', 'false'],
    category: 'Telemetry',
  },
  telemetry_anonymous: {
    description: 'Strip all identifying information before sending telemetry data.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Telemetry',
  },
  detected_env: {
    description: 'Auto-detected IDE/shell environment (set automatically on first run).',
    type: "'vscode' | 'codex' | 'gemini' | 'cursor' | 'tmux' | 'shell' | null",
    default: null,
    options: ['vscode', 'codex', 'gemini', 'cursor', 'tmux', 'shell'],
    category: 'Environment',
  },
  multi_ide_mode: {
    description: 'Enable multi-IDE mode for projects open in multiple editors simultaneously.',
    type: 'boolean',
    default: false,
    options: ['true', 'false'],
    category: 'Environment',
  },
  output_splash: {
    description: 'Show the Deckent ASCII splash screen on init and version commands.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Output',
  },
  output_mode: {
    description: "Output verbosity: 'quiet' (minimal), 'normal' (default), 'verbose' (extra detail).",
    type: "'quiet' | 'normal' | 'verbose'",
    default: 'normal',
    options: ['quiet', 'normal', 'verbose'],
    category: 'Output',
  },
  output_theme: {
    description: "Visual theme: 'default', 'minimal' (no color), 'rich' (extra formatting).",
    type: "'default' | 'minimal' | 'rich'",
    default: 'default',
    options: ['default', 'minimal', 'rich'],
    category: 'Output',
  },
  language: {
    description: 'Primary programming language of the project for context-aware planning.',
    type: 'string | undefined',
    default: undefined,
    category: 'Project',
  },
  projectName: {
    description: 'Display name for the project, used in sprint logs and notifications.',
    type: 'string | undefined',
    default: undefined,
    category: 'Project',
  },
  version: {
    description: 'Pinned Deckent version for reproducible runs (defaults to installed version).',
    type: 'string | undefined',
    default: undefined,
    category: 'Project',
  },
  auto_docs: {
    description: 'Auto-doc tiers: tier1 (CHANGELOG/SPRINT-LOG), tier2 (README), tier3 (BLUEPRINT).',
    type: 'AutoDocsConfig | undefined',
    default: { tier1: true, tier2: false, tier3: false },
    category: 'Project',
  },
  auto_clean_locks: {
    description: 'Automatically remove stale lock files (>5 min old) during auditor scans.',
    type: 'boolean | undefined',
    default: false,
    options: ['true', 'false'],
    category: 'Advanced',
  },
  // ─── Memory ─────────────────────────────────────────────────────────
  memory_budget: {
    description: 'Maximum total lines across all files in .brain/ directory.',
    type: 'number',
    default: 600,
    category: 'Memory',
  },
  decay_after_sprints: {
    description: 'Decay memory entries older than this many sprints.',
    type: 'number',
    default: 5,
    category: 'Memory',
  },
  patterns_enabled: {
    description: 'Enable automatic pattern detection and recording in PATTERNS.md.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Memory',
  },
  project_identity_enabled: {
    description: 'Enable PROJECT-IDENTITY.md updates after each sprint.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Memory',
  },
  // ─── Auditor ────────────────────────────────────────────────────────
  scan_interval: {
    description: 'Auditor scan interval in seconds.',
    type: 'number',
    default: 30,
    category: 'Auditor',
  },
  heartbeat_timeout: {
    description: 'Seconds before a worker heartbeat is considered stale.',
    type: 'number',
    default: 120,
    category: 'Auditor',
  },
  boundary_enforcement: {
    description: 'Enforce worker scope boundaries via git diff checks.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Auditor',
  },
  // ─── Sprint ─────────────────────────────────────────────────────────
  fix_phase_enabled: {
    description: 'Enable a fix phase after initial task execution for failed tasks.',
    type: 'boolean',
    default: true,
    options: ['true', 'false'],
    category: 'Sprint',
  },
  max_fix_retries: {
    description: 'Maximum number of fix retries per task during the fix phase.',
    type: 'number',
    default: 2,
    category: 'Sprint',
  },
  // ─── Rollback ───────────────────────────────────────────────────────
  rollback_policy: {
    description: "Rollback policy: 'never' (default), 'on_failure' (revert failed tasks), 'always'.",
    type: "'never' | 'on_failure' | 'always'",
    default: 'never',
    options: ['never', 'on_failure', 'always'],
    category: 'Sprint',
  },
  deckent_style: {
    description: 'Active runtime style: "sprint" for developer orchestration, "task" for one-shot life assistant.',
    type: "'sprint' | 'task'",
    default: 'sprint',
    options: ['sprint', 'task'],
    category: 'Sprint',
  },
} as const;

/**
 * Return metadata for a single config key.
 * Returns undefined when the key is unknown.
 */
export function getConfigHelp(key: string): ConfigMetadataEntry | undefined {
  return CONFIG_METADATA[key];
}

/**
 * Return all config keys grouped by category, keys sorted alphabetically within each group.
 */
export function listConfigByCategory(): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  for (const [key, entry] of Object.entries(CONFIG_METADATA)) {
    const cat = entry.category;
    if (!result[cat]) result[cat] = [];
    result[cat].push(key);
  }
  for (const cat of Object.keys(result)) {
    result[cat]?.sort();
  }
  return result;
}

/**
 * Generate markdown content for CONFIG-REFERENCE.md from CONFIG_METADATA.
 */
export function generateConfigReference(): string {
  const grouped = listConfigByCategory();
  const categories = Object.keys(grouped).sort();

  const lines: string[] = [
    '# Deckent Config Reference',
    '',
    '> Auto-generated from `CONFIG_METADATA`. Do not edit manually.',
    '',
    '## Table of Contents',
    '',
  ];

  for (const cat of categories) {
    lines.push(`- [${cat}](#${cat.toLowerCase()})`);
  }
  lines.push('');

  for (const cat of categories) {
    lines.push(`## ${cat}`, '');
    const keys = grouped[cat];
    if (!keys) continue;
    for (const key of keys) {
      const meta = CONFIG_METADATA[key];
      if (!meta) continue;
      lines.push(`### \`${key}\``, '');
      lines.push(`**Description:** ${meta.description}`, '');
      lines.push(`**Type:** \`${meta.type}\``);
      const defVal =
        meta.default === undefined
          ? '*(not set)*'
          : meta.default === null
            ? '`null`'
            : `\`${JSON.stringify(meta.default)}\``;
      lines.push(`**Default:** ${defVal}`);
      if (meta.options && meta.options.length > 0) {
        lines.push(`**Options:** ${meta.options.map((o) => `\`${o}\``).join(', ')}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

/**
 * Merge global + project partial configs over defaults into a ResolvedConfig.
 * Both parameters may be null.
 */
export function mergeConfigs(
  globalConfig: Partial<DeckentConfig> | null,
  projectConfig: Partial<DeckentConfig> | null,
): ResolvedConfig {
  let config = createDefaultConfig();

  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }
  if (projectConfig) {
    config = deepMerge(config, projectConfig);
  }

  // Resolve legacy mode aliases so 'max_plan' → 'performance' etc.
  config.mode = resolveMode(config.mode) as PlanMode;

  validateConfig(config);

  const activeModeConfig = (config.modes[config.mode] ?? config.modes['performance']) as PlanModeConfig;

  return {
    mode: config.mode,
    activeModeConfig,
    modes: config.modes,
    language: config.language ?? DEFAULT_LANGUAGE,
    projectName: config.projectName ?? 'deckent-project',
    projectRoot: resolve(process.cwd()),
    version: config.version ?? DECKENT_VERSION,
    auto_docs: config.auto_docs ?? { ...DEFAULT_AUTO_DOCS },
    skills: config.skills,
    coverage_threshold: config.coverage_threshold ?? 90,
    max_reroutes: config.max_reroutes ?? 3,
    reroute_on_tech_debt: config.reroute_on_tech_debt ?? false,
    sprint_timeout_minutes: config.sprint_timeout_minutes ?? 0,
    adaptive_thresholds: config.adaptive_thresholds ?? false,
    agent_min_score: config.agent_min_score ?? 5,
    adaptive_config: config.adaptive_config ?? { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    deckent_style: config.deckent_style ?? 'sprint',
    // Sprint 156: default true unless overridden by user/project config
    dependency_pipeline_enabled:
      (config as DeckentConfigWithPipeline).dependency_pipeline_enabled ?? true,
    // Terminal (Sprint 175) — deepMerge applies any partial project override on
    // top of DEFAULT_TERMINAL_CONFIG so unspecified keys inherit defaults,
    // mirroring the model_strategy nested-merge pattern.
    terminal: config.terminal
      ? deepMerge(DEFAULT_TERMINAL_CONFIG, config.terminal as Partial<TerminalConfig>)
      : structuredClone(DEFAULT_TERMINAL_CONFIG),
  };
}

