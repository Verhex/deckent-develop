import { writeFile, mkdir } from 'node:fs/promises';
import { existsSync, statSync, writeFileSync, renameSync, readFileSync, copyFileSync } from 'node:fs';
import { dirname, join, posix, win32, resolve } from 'node:path';
import { z } from 'zod';
import {
  PROJECT_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_LANGUAGE,
  DEFAULT_MODE,
  DECKENT_VERSION,
  SUPPORTED_LANGUAGES,
} from './constants.js';
import { readJsonSafeAsync, debugLog } from './utils.js';
import { needsMigration, migrateConfig, removeDuplicateKeys } from './config-migration.js';
import { loadApprovalRules } from './approval-rules-load.js';
import { normalizeGlobalScopePlatform, resolveGlobalScopePaths } from './global-scope-resolver.js';
import type { GlobalScopeEnv } from './global-scope-resolver.js';
import type {
  AutoDocsConfig,
  BrainPlanningMode,
  DeckentConfig,
  PlanMode,
  PlanModeConfig,
  PromptConfig,
  ResolvedConfig,
  SystemProfile,
  TerminalConfig,
  TimeoutConfig,
} from './types.js';
import { getAllKnownModelIds, PROVIDER_MODEL_MAP } from './types.js';
import type { ProviderName } from './types.js';
import { MODE_PRESETS } from './mode-presets.js';
import type { ModelStrategy } from './mode-presets.js';
import { metric } from './observability.js';
import { interpolateConfig } from './deck-interpolation.js';

/**
 * Local intersection alias for `token_throttle_ms` — the pre-spawn quota gate
 * pacing knob added in Sprint 202 Task 202-004. Declared here so callers can
 * read `config.token_throttle_ms` without modifying config-types.ts (out of
 * this task's scope). Default 500 ms.
 *
 * (Sprint 428 SCHED-7 note: this WAS one of a small family of such local-cast
 * aliases alongside `DeckentConfigWithPipeline` for `dependency_pipeline_enabled`
 * — 428-011 promoted that FIFO/dependency-behavior field directly onto
 * `DeckentConfig` [config-types.ts] and removed its alias. `token_throttle_ms`
 * is a cost-pacing knob, not a FIFO/dependency switch, so it is intentionally
 * left as a local-cast idiom here.)
 */
type DeckentConfigWithThrottle = DeckentConfig & { token_throttle_ms?: number };

/**
 * ResolvedConfig augmented with `token_throttle_ms` so the field can flow
 * through `loadConfig`/`mergeConfigs` without modifying config-types.ts
 * (out of Sprint 202 Task 202-004 scope). Consumers should read the field
 * via {@link getTokenThrottleMs}.
 */
type ResolvedConfigWithThrottle = ResolvedConfig & { token_throttle_ms?: number };

/**
 * Sprint 220 Task 220-001 — `chat_provider` is the optional override for the
 * native REPL (`deckent` argümansız → `deckent chat --native`) provider. It
 * sits next to `brain_provider` so users can decouple the planner provider
 * (e.g. opus) from the REPL provider (e.g. ollama-local). Local intersection
 * aliases follow the existing `…WithPipeline`/`…WithThrottle` pattern so the
 * shared `config-types.ts` interface stays untouched.
 */
export type ChatProviderName = 'claude' | 'codex' | 'gemini' | 'ollama';
type DeckentConfigWithChatProvider = DeckentConfig & { chat_provider?: ChatProviderName };
type ResolvedConfigWithChatProvider = ResolvedConfig & { chat_provider?: ChatProviderName };

/**
 * Sprint 319 Task B-MAXWORKERS-WIRE — the **top-level** `max_workers` is a real
 * raw-config field (read by cli/resources.ts + cli/doctor.ts, written by
 * cli/init-steps.ts, preserved by config-migration `removeDuplicateKeys`
 * Decision 2) but was historically DEAD: never surfaced onto `ResolvedConfig`,
 * so {@link resolveEffectiveWorkers} ignored it and the active-mode preset always
 * won. These local intersection aliases follow the existing
 * `…WithThrottle`/`…WithChatProvider` pattern so the shared `config-types.ts`
 * interface stays untouched. The field is carried through `mergeConfigs`/
 * `loadConfig` and honored as an explicit override (numeric wins; 'auto' takes the
 * auto path; absent preserves the prior preset behavior).
 */
type DeckentConfigWithMaxWorkers = DeckentConfig & { max_workers?: number | 'auto' };
type ResolvedConfigWithMaxWorkers = ResolvedConfig & { max_workers?: number | 'auto' };

/**
 * Resolve the REPL chat provider via the documented fallback chain:
 *   1. config.chat_provider (explicit REPL override)
 *   2. config.brain_provider (project's primary provider)
 *   3. 'claude' (safe default — most users have `claude` installed)
 *
 * Returns 'claude' for any value outside the allowed set so a corrupt config
 * cannot crash the REPL boot path. Pure function; safe for sync callers.
 */
export function resolveChatProvider(
  config: Partial<ResolvedConfig> | Partial<DeckentConfig> | undefined | null,
): ChatProviderName {
  if (!config) return 'claude';
  const widened = config as Partial<ResolvedConfigWithChatProvider & DeckentConfigWithChatProvider>;
  const candidate = widened.chat_provider ?? widened.brain_provider ?? 'claude';
  return (candidate === 'claude' || candidate === 'codex' || candidate === 'gemini' || candidate === 'ollama')
    ? candidate
    : 'claude';
}

/** Typed error thrown by {@link assertChatProviderAvailable}. */
export class ChatProviderError extends Error {
  readonly code: 'PROVIDER_UNAVAILABLE';
  readonly provider: ChatProviderName;
  constructor(provider: ChatProviderName, detail?: string) {
    const msg = `[deckent] Chat provider '${provider}' is unavailable.${detail ? ' ' + detail : ''} Check your config or run \`deckent doctor\`.`;
    super(msg);
    this.name = 'ChatProviderError';
    this.code = 'PROVIDER_UNAVAILABLE';
    this.provider = provider;
  }
}

/**
 * Resolve the REPL chat provider with optional local-model fallback.
 *
 * Extended fallback chain:
 *   1. config.chat_provider (explicit REPL override)
 *   2. config.brain_provider (project's primary provider)
 *   3. config.chat?.local_fallback (e.g. 'ollama') when set
 *   4. 'claude' (safe default)
 *
 * @param isAvailable Optional sync probe — when provided, if the resolved provider
 *   returns false the function falls back to `chat.local_fallback` (if configured).
 *   Does NOT throw; throwing is left to {@link assertChatProviderAvailable}.
 */
export function resolveChatProviderWithFallback(
  config: Partial<ResolvedConfig> | Partial<DeckentConfig> | undefined | null,
  isAvailable?: (provider: ChatProviderName) => boolean,
): ChatProviderName {
  const primary = resolveChatProvider(config);
  if (!isAvailable || isAvailable(primary)) return primary;

  // Primary unavailable — check chat.local_fallback
  const chatBlock = (config as Record<string, unknown>)?.['chat'] as Record<string, unknown> | undefined;
  const localFallback = chatBlock?.['local_fallback'];
  if (localFallback === 'ollama') return 'ollama';
  return primary; // caller decides what to do; assertChatProviderAvailable can throw
}

/**
 * Assert that a resolved provider is available. Throws {@link ChatProviderError}
 * with a clear, actionable message (not a skeleton / silent failure).
 */
export function assertChatProviderAvailable(
  provider: ChatProviderName,
  available: boolean,
  detail?: string,
): void {
  if (!available) throw new ChatProviderError(provider, detail);
}

// ─── Default Timeout Config ─────────────────────────────────────────
// Sprint 192 (Task 192-011, W-INTEGRITY I-5): adaptive timeout knobs added
// without mutating `TimeoutConfig` in config-types.ts (out of this task's
// scope). The local intersection type carries the two new fields so the
// default object stays statically typed; consumers that read these through
// `ResolvedConfig.timeout` use the helpers in sprint-controller.ts which
// perform a runtime-safe lookup with the same defaults.
export type AdaptiveTimeoutFields = {
  /**
   * Multiplier applied on top of `brainEstimateTimeout` (effort × loc × scope
   * × history × backend) to enforce the user rule "zaman sınırlarını daha
   * geniş tutalım". 1.0 = no change; values < 1 are rejected by validation.
   */
  adaptive_multiplier: number;
  /**
   * Maximum heartbeat-aware runtime extensions granted per task (raised from
   * the legacy hard-coded `3` cap in sprint-phases.ts; the helper
   * `getRuntimeExtensionMax` in sprint-controller.ts is the wire-point).
   */
  runtime_extension_max: number;
};

export const DEFAULT_ADAPTIVE_MULTIPLIER = 1.5;
export const DEFAULT_RUNTIME_EXTENSION_MAX = 5;

export const DEFAULT_TIMEOUT_CONFIG: TimeoutConfig & AdaptiveTimeoutFields = {
  docker_min_timeout: 1200,
  docker_max_timeout: 7200,
  tmux_min_timeout: 900,
  tmux_max_timeout: 5400,
  subprocess_min_timeout: 600,
  subprocess_max_timeout: 3600,
  effort_base: { low: 600, normal: 1200, high: 2400 },
  loc_scaling_enabled: true,
  history_scaling_enabled: true,
  // Sprint 191 (Task 191-002): default flipped false → true. With ADR-064
  // continuous-dispatch already landing high-effort opus tasks that legitimately
  // run past the structured timeout (Sprint 190 dogfood: 4 partial workers
  // confirmed via .hb freshness + non-empty git diff), the safer default is
  // to grant a bounded heartbeat-aware extension rather than declare a
  // synthetic NO_GO. Wire: evaluateRuntimeExtension in sprint-phases.ts.
  runtime_extension_enabled: true,
  adaptive_multiplier: DEFAULT_ADAPTIVE_MULTIPLIER,
  runtime_extension_max: DEFAULT_RUNTIME_EXTENSION_MAX,
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
// M5-NATIVE-FLIP (376-003): `native_agent` is intentionally NOT listed here —
// `TerminalConfig.native_agent` (config-types.ts) stays absent-by-default
// (undefined), and `isNativeAgentSelected` (src/cli/repl/run.tsx) treats
// "undefined" as the native-ON default, only `false` as the rollback signal.
// Baking `native_agent: true` into this const would change its key-shape,
// which tests/core/config-terminal.test.ts locks with an exact `toEqual`
// snapshot — the default lives in the call-site check instead. TERM-FLOW-
// UNIFY Sprint-1 (422-001) adds a second absent-by-default field for the
// same key-shape reason: `run_flow_v2` (default OFF, opposite direction
// from `native_agent`'s default-ON) has no reader yet this slice, so there
// is no call site to bake a default into at all — omission here already
// resolves it to `undefined` (falsy / off), which is exactly what the flag
// needs. Both
// loadConfig and mergeConfigs already deepMerge `config.terminal` over this
// const in one shared line each, so a project's
// `{ terminal: { native_agent: false } }` override still reaches both
// resolvers with zero further wiring (unlike the flat born-464 fields, which
// needed per-resolver pass-through because they weren't part of an existing
// deepMerge'd block).
export const DEFAULT_TERMINAL_CONFIG: TerminalConfig = {
  enabled: true,
  bind: '127.0.0.1',
  maxSessions: 10,
  idleTimeoutMs: 1_800_000,
  scrollbackBytes: 262_144,
  allowShellKind: true,
};

// ─── Default Prompt Config (Sprint 182 PQ-5 / F7) ───────────────────
// Lenient default threshold (0.3) keeps the ADR set roughly equivalent to
// pre-F7 behaviour while filtering out the long tail of low-relevance ADRs
// that previously inflated worker prompts.
export const DEFAULT_PROMPT_CONFIG: Required<PromptConfig> = {
  adr_min_relevance: 0.3,
  adr_render: 'full',
  // F3.1: stabilize the claude system-prompt prefix for cache reuse (git-status &
  // other per-machine sections move to the first user message). Verified via
  // real-binary smoke; opt-out with `false`.
  exclude_dynamic_system_prompt_sections: true,
};

/**
 * Default per-tenant outbound byte quota over a 24h window (W4-10, invariant I5).
 * Exposed as a separate const so `DEFAULT_TERMINAL_CONFIG` stays the locked
 * Sprint 175 secure-default snapshot; callers wire this into `OutboundLimiter`
 * via `config.terminal.outboundDailyQuotaBytes ?? DEFAULT_OUTBOUND_DAILY_QUOTA_BYTES`.
 */
export const DEFAULT_OUTBOUND_DAILY_QUOTA_BYTES = 1_073_741_824; // 1 GiB

// ─── Heartbeat & Approval Window SSOT Constants ──────────────────────────────
/** ms equivalent of config.heartbeat_timeout default (120s × 1000).
 *  Single SSOT: auditor.scanHeartbeats and StaleWorkerDetector both default to this. */
export const DEFAULT_HEARTBEAT_TIMEOUT_MS = 120_000;
/** Default for config key nervous_system.approve_timeout_attended_ms (30s, interactive sessions). */
export const DEFAULT_APPROVE_TIMEOUT_ATTENDED_MS = 30_000;
/** Default for config key nervous_system.approve_timeout_unattended_ms (5s, CI/background). */
export const DEFAULT_APPROVE_TIMEOUT_UNATTENDED_MS = 5_000;

// ─── Nervous System Zod Schemas (Sprint 180 W0 — Step F) ─────────────
// Runtime validation that mirrors the NervousSystemConfig TypeScript
// interface from config-types.ts. Used by tests and integration
// boundaries to enforce shape + value invariants on incoming config.

/** Per-detector configuration schema (mirrors NervousDetectorConfig). */
export const NERVOUS_DETECTOR_SCHEMA = z
  .object({
    enabled: z.boolean(),
    threshold_ms: z.number().nonnegative().optional(),
    threshold_rate: z.number().min(0).max(1).optional(),
    anomaly_threshold: z.number().min(0).max(1).optional(),
    auto_restore: z.boolean().optional(),
    reserve_for: z.string().optional(),
  })
  .strict();

const NERVOUS_AUTHORITY_MODE_SCHEMA = z.enum(['strict', 'balanced', 'autopilot', 'full-auto']);
const NERVOUS_SEVERITY_MIN_SCHEMA = z.enum(['info', 'warning', 'critical', 'emergency']);
const NERVOUS_APPROVAL_POLICY_SCHEMA = z.enum(['autonomous', 'suggest-30m', 'suggest-5m', 'approve']);
const NERVOUS_SAFETY_FLOOR_ACTION_SCHEMA = z.enum([
  'KILL_LIVE_SPRINT',
  'MANUAL_FILE_DELETE',
  'COST_OVER_THRESHOLD',
  'DESTRUCTIVE_GIT',
  'ADR_DEPRECATE_ACCEPTED',
]);

/** Full Nervous System configuration schema (mirrors NervousSystemConfig). */
export const NERVOUS_SYSTEM_SCHEMA = z
  .object({
    enabled: z.boolean(),
    mode: NERVOUS_AUTHORITY_MODE_SCHEMA,
    actionOverrides: z.record(z.string(), NERVOUS_APPROVAL_POLICY_SCHEMA),
    safety_floor: z.object({
      locked_actions: z.array(NERVOUS_SAFETY_FLOOR_ACTION_SCHEMA),
      cost_threshold_usd: z.number().nonnegative(),
      bypass_allowed: z.boolean(),
    }),
    notifications: z.object({
      channels: z.object({
        mcp: z.boolean(),
        cli: z.boolean(),
        file: z.boolean(),
        desktop: z.boolean(),
      }),
      throttle_ms: z.number().nonnegative(),
      group_info_window_ms: z.number().nonnegative(),
      severity_min: NERVOUS_SEVERITY_MIN_SCHEMA,
      quiet_hours: z.object({
        start: z.string(),
        end: z.string(),
        timezone: z.string(),
      }),
      cross_channel_dedup: z.boolean(),
    }),
    detectors: z.object({
      stale_worker: NERVOUS_DETECTOR_SCHEMA,
      scope_collision: NERVOUS_DETECTOR_SCHEMA,
      debt_trend: NERVOUS_DETECTOR_SCHEMA,
      agent_routing: NERVOUS_DETECTOR_SCHEMA,
      directives_protection: NERVOUS_DETECTOR_SCHEMA,
      dead_event_stream: NERVOUS_DETECTOR_SCHEMA,
      cost_threshold: NERVOUS_DETECTOR_SCHEMA,
      prompt_quality: NERVOUS_DETECTOR_SCHEMA,
      worker_output_variance: NERVOUS_DETECTOR_SCHEMA,
      self_modifying_warner: NERVOUS_DETECTOR_SCHEMA,
      // Sprint 180 W0 — NERVOUS-TODO §11.2 Step F: 6 new detectors.
      task_mode_idle: NERVOUS_DETECTOR_SCHEMA,
      build_failure_recurrence: NERVOUS_DETECTOR_SCHEMA,
      token_spike: NERVOUS_DETECTOR_SCHEMA,
      agent_routing_anomaly: NERVOUS_DETECTOR_SCHEMA,
      scope_collision_rate: NERVOUS_DETECTOR_SCHEMA,
      notification_delivery_health: NERVOUS_DETECTOR_SCHEMA,
    }),
    history_retention_days: z.number().int().min(1),
  })
  .strict();

// ─── Chat Config Schema (Sprint 221 Task 221-010) ────────────────────
// Single source of truth for the `chat` config block. All fields are
// optional — absence produces sade/default behaviour. Tasks 221-004,
// 221-007, and 221-009 consume this schema.

/** Zod schema for the optional `chat` block in .deckent/config.json. */
export const CHAT_CONFIG_SCHEMA = z
  .object({
    provider: z.enum(['claude', 'codex', 'gemini', 'ollama']).optional(),
    mode: z.enum(['user', 'enterprise']).optional(),
    status_line: z.union([z.boolean(), z.array(z.string())]).optional(),
    local_fallback: z.literal('ollama').optional(),
    slash_extra: z.array(z.string()).optional(),
  })
  .strict();

/** TypeScript type derived from {@link CHAT_CONFIG_SCHEMA}. */
export type ChatConfig = z.infer<typeof CHAT_CONFIG_SCHEMA>;

/**
 * Extract and Zod-validate the `chat` block from any config shape.
 * Returns an empty ChatConfig (sade defaults) when the block is absent,
 * non-object, or fails validation.
 */
export function resolveChatConfig(
  config: Partial<ResolvedConfig> | Partial<DeckentConfig> | undefined | null,
): ChatConfig {
  if (!config) return {};
  const raw = (config as Record<string, unknown>)['chat'];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const result = CHAT_CONFIG_SCHEMA.safeParse(raw);
  return result.success ? result.data : {};
}

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
const VALID_BRAIN_PLANNING = ['ai', 'structured', 'auto'] as const;

/** All valid provider names — original Anthropic/OpenAI/Google trio (subscription/API). */
export const VALID_PROVIDERS: readonly ProviderName[] = Object.keys(PROVIDER_MODEL_MAP) as ProviderName[];

/**
 * VALID_PROVIDERS_ALL — extended set including local providers (Ollama).
 *
 * Sprint 190 W-F F-11: Ollama is added as a local LLM provider. Type widening
 * for `ProviderName` lives in task-types.ts (out of scope for task 190-009);
 * runtime validation accepts 'ollama' through this constant so users can run
 * `deckent config set worker_provider ollama` without a validation error.
 *
 * Used by validateConfig() below — the existing VALID_PROVIDERS list is kept
 * untouched for any caller that consumes it as a typed `ProviderName[]`.
 */
export const VALID_PROVIDERS_ALL: readonly string[] = [...VALID_PROVIDERS, 'ollama'];

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

    // born-683 (zero-hardcode): validasyon LIVE registry-listesiyle — donmuş
    // ALL_MODELS snapshot'ı opt-in aileleri (gpt-5.6-sol vb.) tanımıyordu ve
    // meşru brain-devrini düşürüyordu (2026-07-12 canlı-vakası).
    const knownModels = getAllKnownModelIds();
    if (!knownModels.includes(mc.brain_model)) {
      errors.push(`Invalid value '${mc.brain_model}' for field '${prefix}.brain_model'. Valid: ${knownModels.join(', ')}`);
    }

    if (!knownModels.includes(mc.default_model)) {
      errors.push(`Invalid value '${mc.default_model}' for field '${prefix}.default_model'. Valid: ${knownModels.join(', ')}`);
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

  // ─── Top-level brain_planning validation (Task 429-006 PLNR1) ───────
  // Mirrors the per-mode check above — the top-level override must be one of
  // the same valid values, since it takes precedence over the preset's own.
  if (config.brain_planning !== undefined &&
      !(VALID_BRAIN_PLANNING as readonly string[]).includes(config.brain_planning)) {
    errors.push(`Invalid value '${config.brain_planning}' for field 'brain_planning'. Valid: ${VALID_BRAIN_PLANNING.join(', ')}`);
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
  // VALID_PROVIDERS_ALL includes 'ollama' (local LLM) on top of the typed
  // VALID_PROVIDERS list — see Sprint 190 W-F F-11.
  if (config.brain_provider !== undefined &&
      !VALID_PROVIDERS_ALL.includes(config.brain_provider)) {
    errors.push(`Invalid value '${config.brain_provider}' for field 'brain_provider'. Valid: ${VALID_PROVIDERS_ALL.join(', ')}`);
  }

  // Sprint 220 Task 220-001 — chat_provider validation (optional REPL override).
  const cfgWithChat = config as DeckentConfigWithChatProvider;
  if (cfgWithChat.chat_provider !== undefined &&
      !VALID_PROVIDERS_ALL.includes(cfgWithChat.chat_provider)) {
    errors.push(`Invalid value '${cfgWithChat.chat_provider}' for field 'chat_provider'. Valid: ${VALID_PROVIDERS_ALL.join(', ')}`);
  }

  if (config.worker_provider !== undefined &&
      !VALID_PROVIDERS_ALL.includes(config.worker_provider)) {
    errors.push(`Invalid value '${config.worker_provider}' for field 'worker_provider'. Valid: ${VALID_PROVIDERS_ALL.join(', ')}`);
  }

  if (config.fallback_provider !== undefined &&
      !VALID_PROVIDERS_ALL.includes(config.fallback_provider)) {
    errors.push(`Invalid value '${config.fallback_provider}' for field 'fallback_provider'. Valid: ${VALID_PROVIDERS_ALL.join(', ')}`);
  }

  if (config.provider_overrides !== undefined) {
    if (typeof config.provider_overrides !== 'object' || config.provider_overrides === null || Array.isArray(config.provider_overrides)) {
      errors.push('provider_overrides must be an object');
    } else {
      for (const [key, value] of Object.entries(config.provider_overrides)) {
        if (!VALID_PROVIDERS_ALL.includes(value)) {
          errors.push(`Invalid provider "${value}" in provider_overrides["${key}"]. Must be one of: ${VALID_PROVIDERS_ALL.join(', ')}`);
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
  if (config.retry_transient_failures !== undefined && typeof config.retry_transient_failures !== 'boolean') {
    errors.push('retry_transient_failures must be a boolean');
  }

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

    // per-backend max <= 86400 (24h). Sprint 186 raised from 14400 (4h) to 86400 (24h)
    // to support long-running per-file audit sprints (479 tasks × opus ≈ 13h).
    const maxFields = ['docker_max_timeout', 'tmux_max_timeout', 'subprocess_max_timeout'] as const;
    for (const field of maxFields) {
      if (t[field] > 86400) {
        errors.push(`timeout.${field} must be <= 86400`);
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

    // Sprint 192 (Task 192-011): adaptive multiplier + extension cap.
    // Read from the raw user partial so we surface the failure even when
    // the deep-merged `t` would have fallen back to a sane default.
    const adaptive = (config.timeout as Partial<AdaptiveTimeoutFields>);
    if (adaptive.adaptive_multiplier !== undefined) {
      const v = adaptive.adaptive_multiplier;
      if (typeof v !== 'number' || !Number.isFinite(v) || v < 1.0) {
        errors.push(
          `Invalid value '${v}' for field 'timeout.adaptive_multiplier'. Must be a finite number >= 1.0.`,
        );
      }
    }
    if (adaptive.runtime_extension_max !== undefined) {
      const v = adaptive.runtime_extension_max;
      if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) {
        errors.push(
          `Invalid value '${v}' for field 'timeout.runtime_extension_max'. Must be an integer >= 1.`,
        );
      }
    }

    // born-667a (Task 427-023, TIMEOUT-TIER): optional model-tier multiplier.
    // Absent entirely = 1.0 for every tier (today's behavior, unchanged).
    const modelMultiplier = (config.timeout as Partial<TimeoutConfig>).model_multiplier;
    if (modelMultiplier !== undefined) {
      const validTiers = ['economy', 'standard', 'premium', 'premium_plus'] as const;
      for (const [tier, value] of Object.entries(modelMultiplier)) {
        if (!(validTiers as readonly string[]).includes(tier)) {
          errors.push(
            `Invalid tier '${tier}' for field 'timeout.model_multiplier'. Valid: ${validTiers.join(', ')}`,
          );
          continue;
        }
        if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
          errors.push(
            `Invalid value '${value}' for field 'timeout.model_multiplier.${tier}'. Must be a finite number > 0.`,
          );
        }
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

  // ─── Autonomous Engine validation ──────────────────────────────────
  if (config.autonomous !== undefined) {
    const au = config.autonomous;
    if (typeof au.enabled !== 'boolean') {
      errors.push('autonomous.enabled must be a boolean');
    }
    if (au.interval_ms !== undefined && (typeof au.interval_ms !== 'number' || au.interval_ms < 0)) {
      errors.push('autonomous.interval_ms must be >= 0');
    }
    if (au.pool_size !== undefined && (typeof au.pool_size !== 'number' || !Number.isInteger(au.pool_size) || au.pool_size < 1)) {
      errors.push('autonomous.pool_size must be an integer >= 1');
    }
    const reactive = au.reactive;
    if (reactive !== undefined) {
      if (typeof reactive.enabled !== 'boolean') {
        errors.push('autonomous.reactive.enabled must be a boolean');
      }
      if (reactive.map_path !== undefined && typeof reactive.map_path !== 'string') {
        errors.push('autonomous.reactive.map_path must be a string');
      }
    }
    const workGen = au.work_generator;
    if (workGen !== undefined) {
      if (typeof workGen.enabled !== 'boolean') {
        errors.push('autonomous.work_generator.enabled must be a boolean');
      }
      if (workGen.interval_ms !== undefined && (typeof workGen.interval_ms !== 'number' || workGen.interval_ms < 0)) {
        errors.push('autonomous.work_generator.interval_ms must be >= 0');
      }
    }
    const rbacPolicy = au.rbac_policy;
    if (rbacPolicy !== undefined) {
      if (typeof rbacPolicy.enabled !== 'boolean') {
        errors.push('autonomous.rbac_policy.enabled must be a boolean');
      }
      if (rbacPolicy.role !== undefined && !['admin', 'operator', 'viewer'].includes(rbacPolicy.role)) {
        errors.push('autonomous.rbac_policy.role must be admin|operator|viewer');
      }
    }
  }

  // ─── Resource Monitor validation ────────────────────────────────────
  if (config.resource_monitor !== undefined) {
    const rm = config.resource_monitor;
    if (typeof rm.enabled !== 'boolean') {
      errors.push('resource_monitor.enabled must be a boolean');
    }
    if (rm.interval_ms !== undefined) {
      if (typeof rm.interval_ms !== 'number' || rm.interval_ms < 1000) {
        errors.push('resource_monitor.interval_ms must be a number >= 1000');
      }
    }
    if (rm.log_path !== undefined && typeof rm.log_path !== 'string') {
      errors.push('resource_monitor.log_path must be a string');
    }
  }


  // ─── Cross Verify validation (Sprint 276 XVER-1) ─────────────────────
  if (config.cross_verify !== undefined) {
    const cv = config.cross_verify;
    if (typeof cv.enabled !== 'boolean') {
      errors.push('cross_verify.enabled must be a boolean');
    }
    if (cv.high_stakes_only !== undefined && typeof cv.high_stakes_only !== 'boolean') {
      errors.push('cross_verify.high_stakes_only must be a boolean');
    }
    if (cv.enforce_refuted !== undefined && typeof cv.enforce_refuted !== 'boolean') {
      errors.push('cross_verify.enforce_refuted must be a boolean');
    }
    if (cv.verifier_priority !== undefined) {
      if (!Array.isArray(cv.verifier_priority)) {
        errors.push('cross_verify.verifier_priority must be an array of strings');
      } else {
        for (const item of cv.verifier_priority) {
          if (typeof item !== 'string') {
            errors.push('cross_verify.verifier_priority must be an array of strings');
            break;
          }
        }
      }
    }
  }

  // ─── Worker Comms validation (Sprint 278 COMM-1) ─────────────────────
  if (config.worker_comms !== undefined) {
    const wc = config.worker_comms;
    if (typeof wc.enabled !== 'boolean') {
      errors.push('worker_comms.enabled must be a boolean');
    }
    if (wc.shared_memory_ttl_ms !== undefined && typeof wc.shared_memory_ttl_ms !== 'number') {
      errors.push('worker_comms.shared_memory_ttl_ms must be a number');
    }
    if (wc.inject_handoffs !== undefined && typeof wc.inject_handoffs !== 'boolean') {
      errors.push('worker_comms.inject_handoffs must be a boolean');
    }
    if (wc.inject_shared !== undefined && typeof wc.inject_shared !== 'boolean') {
      errors.push('worker_comms.inject_shared must be a boolean');
    }
  }

  // ─── Cost Guard validation (Sprint 279 WK-cost) ─────────────────────
  if (config.cost_guard !== undefined) {
    const cg = config.cost_guard;
    if (typeof cg.enabled !== 'boolean') {
      errors.push('cost_guard.enabled must be a boolean');
    }
    if (cg.max_limit_cost_usd !== undefined) {
      if (typeof cg.max_limit_cost_usd !== 'number' || cg.max_limit_cost_usd <= 0) {
        errors.push('cost_guard.max_limit_cost_usd must be a positive number');
      }
    }
  }

  // ─── Scheduler shadow-reducer validation (SCHED4) ───────────────────
  if (config.scheduler !== undefined) {
    const sch = config.scheduler;
    if (sch.shadow_reducer !== undefined && typeof sch.shadow_reducer !== 'boolean') {
      errors.push('scheduler.shadow_reducer must be a boolean');
    }
    // SCHED5 (docs/analysis/scheduler-unify-design-2026-07-11.md dilim-5):
    // `engine` selects the live scheduler driver (default 'legacy', see
    // scheduler-driver.ts's resolveSchedulerEngine). Promoted onto
    // SchedulerConfig (config-types.ts) by SCHED-7 (428-011) — typed directly,
    // no local cast needed.
    if (sch.engine !== undefined && sch.engine !== 'legacy' && sch.engine !== 'reducer') {
      errors.push("scheduler.engine must be 'legacy' or 'reducer'");
    }
  }

  // ─── Scheduler shadow-retention validation ─────────────────────────
  if (config.scheduler_shadow_retention?.retention_days !== undefined) {
    const v = config.scheduler_shadow_retention.retention_days;
    if (typeof v !== 'number' || v < 1 || v > 365) {
      errors.push('scheduler_shadow_retention.retention_days must be a number between 1 and 365');
    }
  }

  // ─── Gate config validation (Sprint 325) ───────────────────────────
  if (config.gate !== undefined) {
    const g = config.gate;
    if (g.max_tech_debt_ratio !== undefined) {
      const v = g.max_tech_debt_ratio;
      if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1) {
        errors.push(`Invalid value '${v}' for field 'gate.max_tech_debt_ratio'. Must be a number in [0, 1].`);
      }
    }
    if (g.verify_delta_downgrade !== undefined && typeof g.verify_delta_downgrade !== 'boolean') {
      errors.push(`Invalid value '${g.verify_delta_downgrade}' for field 'gate.verify_delta_downgrade'. Must be a boolean.`);
    }
    if (g.enforce_adr_compliance !== undefined && typeof g.enforce_adr_compliance !== 'boolean') {
      errors.push(`Invalid value '${g.enforce_adr_compliance}' for field 'gate.enforce_adr_compliance'. Must be a boolean.`);
    }
  }

  // ─── Approval config validation (Sprint 355 CFG-APR-WIRE) ───────────
  // NOTE: `approval.rules` is intentionally NOT validated here — a malformed
  // rule must never throw / break config load. Rule-level validation is
  // fully owned by `loadApprovalRules` (approval-rules-load.ts), invoked
  // fail-soft from `loadConfig`/`mergeConfigs` via `resolveApprovalConfig`
  // (warnings only, routed through `debugLog`). Only the gate/relay
  // activation flags get a shallow throwing type-check here, mirroring the
  // other opt-in blocks above.
  if (config.approval !== undefined) {
    const apr = config.approval;
    if (typeof apr !== 'object' || apr === null || Array.isArray(apr)) {
      errors.push('approval must be an object');
    } else {
      if (apr.gate_enabled !== undefined && typeof apr.gate_enabled !== 'boolean') {
        errors.push('approval.gate_enabled must be a boolean');
      }
      if (apr.relay_enabled !== undefined && typeof apr.relay_enabled !== 'boolean') {
        errors.push('approval.relay_enabled must be a boolean');
      }
    }
  }

  // ─── deckent_style validation ───────────────────────────────────────
  if (config.deckent_style !== undefined && !['sprint', 'task', 'process'].includes(config.deckent_style)) {
    errors.push(`Invalid value '${config.deckent_style}' for field 'deckent_style'. Valid options: sprint, task, process`);
  }

  // ─── Routing Engine validation ──────────────────────────────────────
  // V1 removed (ROUTE-V1-PURGE / ADR-G-006): only 'v2' is a valid value.
  if (config.routing_engine !== undefined) {
    const validRoutingEngines = ['v2'] as const;
    if (!(validRoutingEngines as readonly string[]).includes(config.routing_engine)) {
      errors.push(`Invalid value '${config.routing_engine}' for field 'routing_engine'. Valid: ${validRoutingEngines.join(', ')}`);
    }
  }

  // ─── Routing behaviour flags validation (T6) ───────────────────────
  if (config.routing !== undefined) {
    if (typeof config.routing !== 'object' || config.routing === null || Array.isArray(config.routing)) {
      errors.push('routing must be an object');
    } else {
      if (config.routing.skill_agent_affinity !== undefined && typeof config.routing.skill_agent_affinity !== 'boolean') {
        errors.push('routing.skill_agent_affinity must be a boolean');
      }
      if (config.routing.agent_cache !== undefined && typeof config.routing.agent_cache !== 'boolean') {
        errors.push('routing.agent_cache must be a boolean');
      }
    }
  }

  // ─── Prompt config validation (Sprint 182 PQ-5 / F7) ────────────────
  if (config.prompt?.adr_min_relevance !== undefined) {
    const v = config.prompt.adr_min_relevance;
    if (typeof v !== 'number' || Number.isNaN(v) || v < 0 || v > 1) {
      errors.push(
        `Invalid value '${v}' for field 'prompt.adr_min_relevance'. Must be a number in [0, 1].`,
      );
    }
  }
  if (config.prompt?.adr_render !== undefined) {
    const validAdrRender = ['full', 'operative'];
    if (!validAdrRender.includes(config.prompt.adr_render)) {
      errors.push(
        `Invalid value '${config.prompt.adr_render}' for field 'prompt.adr_render'. Valid: ${validAdrRender.join(', ')}.`,
      );
    }
  }
  if (
    config.prompt?.exclude_dynamic_system_prompt_sections !== undefined &&
    typeof config.prompt.exclude_dynamic_system_prompt_sections !== 'boolean'
  ) {
    errors.push(
      `Invalid value '${config.prompt.exclude_dynamic_system_prompt_sections}' for field ` +
      `'prompt.exclude_dynamic_system_prompt_sections'. Must be a boolean.`,
    );
  }

  // ─── Plan config validation (Sprint 276 PLAN-INT-1) ─────────────────
  if (config.plan?.interrogate !== undefined && typeof config.plan.interrogate !== 'boolean') {
    errors.push(`Invalid value '${String(config.plan.interrogate)}' for field 'plan.interrogate'. Must be a boolean.`);
  }

  // ─── Chat config validation (Sprint 221 Task 221-010) ───────────────
  const chatBlock = (config as unknown as Record<string, unknown>)['chat'];
  if (chatBlock !== undefined) {
    const chatResult = CHAT_CONFIG_SCHEMA.safeParse(chatBlock);
    if (!chatResult.success) {
      for (const issue of chatResult.error.issues) {
        const path = issue.path.length > 0 ? `chat.${issue.path.join('.')}` : 'chat';
        errors.push(`${path}: ${issue.message}`);
      }
    }
  }

  // ─── API OIDC validation (Sprint 267 T-267-001) ─────────────────────
  // Optional block — absent means today's static-token-only behavior. NEVER
  // echo `key` material into an error message (secret-leak guard).
  if (config.api_oidc !== undefined) {
    const oidc = config.api_oidc as unknown as Record<string, unknown>;
    if (typeof oidc['enabled'] !== 'boolean') {
      errors.push('api_oidc.enabled must be a boolean');
    }
    const oidcAlgorithm = oidc['algorithm'];
    if (oidcAlgorithm !== undefined && oidcAlgorithm !== 'HS256' && oidcAlgorithm !== 'RS256') {
      errors.push(`Invalid value '${String(oidcAlgorithm)}' for field 'api_oidc.algorithm'. Valid: HS256, RS256`);
    }
    if (oidc['audience'] !== undefined && typeof oidc['audience'] !== 'string') {
      errors.push('api_oidc.audience must be a string');
    }
    if (oidc['enabled'] === true) {
      if (typeof oidc['issuer'] !== 'string' || oidc['issuer'].length === 0) {
        errors.push('api_oidc.issuer must be a non-empty string when api_oidc.enabled is true');
      }
      if (typeof oidc['key'] !== 'string' || oidc['key'].length === 0) {
        errors.push('api_oidc.key must be a non-empty string when api_oidc.enabled is true');
      }
      if (oidcAlgorithm === undefined) {
        errors.push('api_oidc.algorithm is required when api_oidc.enabled is true. Valid: HS256, RS256');
      }
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
 *
 * Precedence (Sprint 319 Task B-MAXWORKERS-WIRE):
 *   1. top-level `config.max_workers` (numeric)  → explicit override, wins outright
 *   2. top-level `config.max_workers === 'auto'`  → systemProfile auto path
 *   3. `config.activeModeConfig.max_workers`       → mode preset / per-mode value
 *
 * - 'auto' (top-level or per-mode): uses systemProfile.recommendedMaxWorkers,
 *   capped by an optional plan_limit
 * - number: returns the configured value directly
 *
 * The top-level override lets a user pin `max_workers` in config.json without
 * editing every mode preset. A non-numeric / non-'auto' top-level value (or an
 * absent one) falls through to the prior mode-config behavior unchanged.
 */
export function resolveEffectiveWorkers(
  config: ResolvedConfig,
  systemProfile: SystemProfile,
  planLimit?: number,
): number {
  // Sprint 319 (B-MAXWORKERS-WIRE): honor the explicit top-level override first.
  const topLevel = (config as ResolvedConfigWithMaxWorkers).max_workers;
  if (typeof topLevel === 'number' && Number.isFinite(topLevel) && topLevel >= 1) {
    return topLevel;
  }

  const maxWorkers = topLevel === 'auto' ? 'auto' : config.activeModeConfig.max_workers;
  if (maxWorkers === 'auto') {
    const recommended = systemProfile.recommendedMaxWorkers;
    return planLimit !== undefined ? Math.min(recommended, planLimit) : recommended;
  }
  return maxWorkers;
}

/**
 * Resolve the effective Brain planning mode.
 *
 * Precedence (Task 429-006 — PLNR1, eski-🔴 Bug-1):
 *   1. explicit top-level `config.brain_planning`        → wins outright
 *   2. `config.activeModeConfig.brain_planning` (preset)  → today's behavior
 *   3. 'auto'
 *
 * The top-level field lets a user pin `brain_planning` in config.json without
 * editing every mode preset — mirroring the `max_workers` top-level override
 * pattern (Sprint 319 B-MAXWORKERS-WIRE / {@link resolveEffectiveWorkers}).
 * An absent top-level value falls through to the prior preset-only behavior
 * unchanged. Callers (e.g. sprint-planner.ts) MUST resolve through this
 * helper instead of reading `config.activeModeConfig.brain_planning` directly.
 */
export function resolveBrainPlanningMode(config: ResolvedConfig): BrainPlanningMode {
  return config.brain_planning ?? config.activeModeConfig.brain_planning ?? 'auto';
}

// ─── Coverage gate resolver (Sprint 179 W2-4) ────────────────────────

/**
 * Resolve the coverage gate split fields:
 *   - `coverage_hard_floor`   immutable EVALUATE gate (default 50)
 *   - `coverage_aspirational` finalizer-tunable target (default 90)
 *   - `coverage_threshold`    legacy field, mirrored to aspirational
 *
 * Precedence for the aspirational target:
 *   explicit `coverage_aspirational` > legacy `coverage_threshold` > 90.
 * The hard floor is clamped at the aspirational value so the floor never
 * exceeds the target.
 */
export function resolveCoverageGates(
  config: Partial<DeckentConfig>,
): { coverage_hard_floor: number; coverage_aspirational: number; coverage_threshold: number } {
  const aspirational =
    config.coverage_aspirational ?? config.coverage_threshold ?? 90;
  const requestedFloor = config.coverage_hard_floor ?? 50;
  const hardFloor = Math.min(requestedFloor, aspirational);
  return {
    coverage_hard_floor: hardFloor,
    coverage_aspirational: aspirational,
    coverage_threshold: aspirational, // back-compat mirror
  };
}

/**
 * Resolve the `approval` config block (Sprint 355 CFG-APR-WIRE) — the single
 * authority turning raw `approval.rules` JSON into a validated
 * `ApprovalPolicyRule[]` plus the gate/relay activation flags. Rule
 * validation itself is fully owned by `loadApprovalRules`
 * (approval-rules-load.ts, READ-ONLY here — never re-implemented); a
 * malformed rule entry is skipped with a warning routed through `debugLog`,
 * never thrown — a broken `approval.rules` block must not break config load
 * or a sprint. Called from both `loadConfig` and `mergeConfigs`, mirroring
 * `resolveCoverageGates`.
 */
export function resolveApprovalConfig(
  config: Partial<DeckentConfig>,
): NonNullable<ResolvedConfig['approval']> {
  const { rules, warnings } = loadApprovalRules(config);
  for (const warning of warnings) {
    debugLog('cfg-apr-wire', warning);
  }
  return {
    rules,
    gate_enabled: config.approval?.gate_enabled ?? false,
    relay_enabled: config.approval?.relay_enabled ?? false,
    question_bridge: config.approval?.question_bridge === true,
  };
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
  const config: DeckentConfigWithThrottle = {
    mode: DEFAULT_MODE,
    modes: structuredClone(DEFAULT_MODES),
    // Provider (Sprint 150 Decision 4 — grouped `providers` is canonical; flat keys deprecated)
    providers: { brain: 'claude', worker: 'claude' },
    provider_overrides: undefined,
    cost_optimization: false,
    // claude_backend removed (Sprint 150 Decision 3 — use spawn_backend instead)
    // Sprint 177: default changed from undefined/tmux to 'docker' (ADR-027, Sprint 176 evidence)
    spawn_backend: 'docker',
    auth_mode: 'subscription',
    // Human Checkpoints (empty = fully autonomous)
    human_checkpoints: [],
    // Sprint
    fix_phase_enabled: true,
    max_fix_retries: 2,
    // @deprecated retained as the aspirational seed for legacy configs.
    coverage_threshold: 90,
    // Sprint 179 W2-4 — split single threshold into immutable floor +
    // adaptive aspirational target. Defaults are also asserted by
    // `resolveCoverageGates`, which is the single resolver consulted by
    // `mergeConfigs`/`loadConfig` BEFORE the deep-merge with defaults so the
    // legacy `coverage_threshold` precedence is preserved.
    coverage_hard_floor: 50,
    coverage_aspirational: 90,
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
    // Dependency pipeline enabled — see DeckentConfig.dependency_pipeline_enabled
    // (config-types.ts) for the full history/rollback note. Default true.
    dependency_pipeline_enabled: true,
    // Sprint checkpoint interval: how many terminal tasks before writing a checkpoint
    sprint_checkpoint_interval: 5,
    // Sprint 202 Task 202-004 — pre-spawn pacing in ms (computeBackoff floor).
    // 0 disables; 500 ms is the conservative default that prevented the
    // Sprint 198 30k tpm Tier-1 burst.
    token_throttle_ms: 500,
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
    // Scheduler Shadow Retention (kullanıcı talebi: 14 gün)
    scheduler_shadow_retention: {
      retention_days: 14,
      archive_path: '.deckent/archive/scheduler-shadow/',
    },
    // Runtime Style
    deckent_style: 'sprint',
    // Terminal (Sprint 175 — embedded web terminal)
    terminal: structuredClone(DEFAULT_TERMINAL_CONFIG),
    // Worker prompt tuning (Sprint 182 PQ-5 / F7 — ADR relevance threshold)
    prompt: structuredClone(DEFAULT_PROMPT_CONFIG),
    // Autonomous Engine (disabled by default — flag-gated, ADR-040)
    autonomous: {
      enabled: false,
      interval_ms: 5000,
      backlog_path: '.deckent/autonomous/backlog.json',
      pool_size: 1,
      reactive: { enabled: false, map_path: '.deckent/autonomous/reactive-map.json' },
      work_generator: { enabled: false, interval_ms: 600000 },
      rbac_policy: { enabled: false, role: 'viewer' },
    },
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
        stale_worker: { enabled: true, threshold_ms: 120000 },
        scope_collision: { enabled: true },
        debt_trend: { enabled: true, threshold_rate: 0.15 },
        agent_routing: { enabled: true, anomaly_threshold: 0.40 },
        directives_protection: { enabled: true, auto_restore: true },
        // Sprint 165: kod hazır — reserve_for kaldırıldı (Sprint 180 W0).
        dead_event_stream: { enabled: false },
        cost_threshold: { enabled: false, reserve_for: 'sprint-148' },
        prompt_quality: { enabled: false, reserve_for: 'sprint-148' },
        worker_output_variance: { enabled: false, reserve_for: 'sprint-148' },
        self_modifying_warner: { enabled: false, reserve_for: 'sprint-148' },
        // Sprint 180 W0 — NERVOUS-TODO §11.2 Step F: 6 yeni detector default
        // enabled:false. Faz 2/3'te aktive edilir.
        task_mode_idle: { enabled: false },
        build_failure_recurrence: { enabled: false },
        token_spike: { enabled: false },
        agent_routing_anomaly: { enabled: false },
        scope_collision_rate: { enabled: false },
        notification_delivery_health: { enabled: false },
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
 * Global config PATH candidates for the current (or injected) platform —
 * Sprint 363 Task 363-004 ONB-GLOBAL-PRECEDENCE, migration phase M1
 * (docs/design/onb-global-install.md §7.1 "Dual-read, legacy-write").
 *
 * `platformPath` is the platform-correct location computed by
 * {@link resolveGlobalScopePaths} (Sprint 361 Task 361-008): XDG on
 * linux/wsl, Application Support on darwin, `%APPDATA%` on win32 — including
 * the `DECKENT_HOME` override, which flows through untouched since the
 * resolver already implements it. `legacyPath` is today's sole candidate —
 * the flat `~/.deckent/config.json` — kept as the read fallback so an
 * existing install with a config file ONLY at the legacy location keeps
 * working unchanged.
 *
 * Resolution never throws: an unsupported platform or an unresolvable home
 * (the resolver's two failure modes — e.g. `HOME` unset but the OS passwd
 * db still resolves a home for `os.homedir()`) collapses both candidates
 * onto `GLOBAL_CONFIG_PATH`, which is strictly more permissive than the
 * resolver's pure-env home lookup — so the fallback can only activate in
 * cases the resolver itself would fail on, never in cases the constant
 * already handled (zero regression risk).
 *
 * `env`/`nodePlatform` are call-time parameters (not module-load-time
 * constants, unlike `GLOBAL_CONFIG_PATH`) so callers and tests can inject
 * an environment without needing a fresh module evaluation.
 */
export function resolveGlobalConfigPaths(
  env: GlobalScopeEnv = process.env,
  nodePlatform: string = process.platform,
): { platformPath: string; legacyPath: string } {
  try {
    const platform = normalizeGlobalScopePlatform(nodePlatform, env);
    const scopePaths = resolveGlobalScopePaths(platform, env);
    // Backend selected by the INJECTED platform, not the host OS — mirrors
    // resolveGlobalScopePaths' own rule so resolving win32 paths on a
    // non-Windows CI host stays deterministic (no mixed separators).
    const pathApi = platform === 'win32' ? win32 : posix;
    return {
      platformPath: pathApi.join(scopePaths.configDir, 'config.json'),
      legacyPath: scopePaths.legacyDir !== null ? pathApi.join(scopePaths.legacyDir, 'config.json') : GLOBAL_CONFIG_PATH,
    };
  } catch {
    return { platformPath: GLOBAL_CONFIG_PATH, legacyPath: GLOBAL_CONFIG_PATH };
  }
}

/**
 * Resolve the effective global config file to READ (dual-read, M1):
 * `platformPath` when a file already exists there, else `legacyPath` —
 * today's behavior, preserved as the fallback. Writes are unaffected:
 * {@link saveGlobalConfig} keeps targeting `GLOBAL_CONFIG_PATH` per the M1
 * design ("writes still go to legacy").
 */
export function resolveGlobalConfigReadPath(
  env: GlobalScopeEnv = process.env,
  nodePlatform: string = process.platform,
): string {
  const { platformPath, legacyPath } = resolveGlobalConfigPaths(env, nodePlatform);
  return existsSync(platformPath) ? platformPath : legacyPath;
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

  const globalConfig = await readJsonFile<Partial<DeckentConfig>>(resolveGlobalConfigReadPath());
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

  // ROUTE-V1-PURGE (ADR-G-006): coerce the retired routing_engine 'v1' → 'v2'.
  // V1 routing is deleted, and validateConfig now REJECTS 'v1' — so an existing
  // install with a legacy on-disk `routing_engine: 'v1'` would throw here and fail
  // every sprint. Silently upgrade the in-memory value (the on-disk file is
  // migrated by migrateConfig / `deckent config migrate`). Also stops a literal
  // 'v1' from reaching the finalizer's legacy stats path (`??` won't catch it).
  if ((config as { routing_engine?: string }).routing_engine === 'v1') {
    (config as { routing_engine?: string }).routing_engine = 'v2';
  }

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
    config.deckent_style = envDeckentStyle as 'sprint' | 'task' | 'process';
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

  const resolved: ResolvedConfigWithThrottle & ResolvedConfigWithChatProvider & ResolvedConfigWithMaxWorkers = {
    mode: config.mode,
    activeModeConfig,
    modes: config.modes,
    language: config.language ?? DEFAULT_LANGUAGE,
    projectName: config.projectName ?? 'deckent-project',
    projectRoot: root,
    version: config.version ?? DECKENT_VERSION,
    // Sprint 319 (B-MAXWORKERS-WIRE): carry the top-level explicit worker-count
    // override into the resolved config so resolveEffectiveWorkers can honor it.
    // Absent → undefined → prior activeModeConfig/preset behavior is preserved.
    max_workers: (config as DeckentConfigWithMaxWorkers).max_workers,
    // Task 429-006 (PLNR1): carry the top-level explicit brain_planning override
    // through so resolveBrainPlanningMode can honor it. Absent → undefined →
    // prior activeModeConfig/preset behavior is preserved.
    brain_planning: config.brain_planning,
    model_strategy: resolvedModelStrategy,
    auto_docs: config.auto_docs ?? { ...DEFAULT_AUTO_DOCS },
    spawn_backend: config.spawn_backend,
    docker_image: config.docker_image,
    docker_timeout: config.docker_timeout,
    worker_memory_limit_by_kind: config.worker_memory_limit_by_kind,
    worker_memory_limit: config.worker_memory_limit,
    skills: config.skills,
    brain_provider: config.brain_provider,
    worker_provider: config.worker_provider,
    fallback_provider: config.fallback_provider,
    // F1-012 — carry grouped `providers` (incl. config-driven `registry`) so
    // bootstrapProviders can register config-declared providers. Routing fields
    // are already flattened above; this preserves `registry` for the registry loop.
    providers: config.providers,
    // Sprint 220 Task 220-001 — optional native REPL provider override.
    chat_provider: (config as DeckentConfigWithChatProvider).chat_provider,
    // Native transport + BOT-1 bot-agent — pass through so loadConfig does not
    // strip them (the REPL native agent + bot-agent read these from config).
    ollama_host: config.ollama_host,
    native_provider: config.native_provider,
    native_model: config.native_model,
    native_context_tokens: config.native_context_tokens,
    openai_base_url: config.openai_base_url,
    bot_agent: config.bot_agent,
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
    retry_transient_failures: config.retry_transient_failures,
    fix_phase_enabled: config.fix_phase_enabled,
    max_fix_retries: config.max_fix_retries,
    // Sprint 179 W2-4: coverage gate split.
    // - hard_floor (default 50) is the immutable EVALUATE gate.
    // - aspirational (default 90) is auto-learned by the finalizer.
    // - legacy `coverage_threshold` seeds aspirational when set explicitly.
    // Resolve from the raw user partials so user-supplied legacy
    // `coverage_threshold` is honored over the default aspirational of 90
    // pre-populated by `createDefaultConfig`.
    ...resolveCoverageGates({
      ...(globalConfig ?? {}),
      ...(projectConfig ?? {}),
    }),
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
    routing: config.routing,
    // Cleanup delay
    cleanup_delay_ms: config.cleanup_delay_ms,
    // Dependency pipeline (Sprint 156: default true; user/project config can override)
    dependency_pipeline_enabled: config.dependency_pipeline_enabled ?? true,
    // Pre-sprint full-vitest baseline (Sprint 255: default FALSE — the full suite
    // blocks sprint start; opt-in only). Speeds sprint start dramatically.
    pre_sprint_tests: config.pre_sprint_tests ?? false,
    // Strict multi-tenant isolation (Sprint 261 ENT-2: default FALSE — backward-compat
    // permissive mode includes NULL-tenant rows). Set true to close NULL-tenant leak.
    strict_tenant_isolation: config.strict_tenant_isolation ?? false,
    // AI planner timeout
    ai_planner_timeout: config.ai_planner_timeout,
    // Sprint checkpoint interval
    sprint_checkpoint_interval: config.sprint_checkpoint_interval,
    // Sprint 202 Task 202-004 — pre-spawn pacing (computeBackoff wire).
    token_throttle_ms:
      (config as DeckentConfigWithThrottle).token_throttle_ms ?? 500,
    // Timeout
    timeout: config.timeout
      ? deepMerge(DEFAULT_TIMEOUT_CONFIG, config.timeout as Partial<TimeoutConfig>)
      : structuredClone(DEFAULT_TIMEOUT_CONFIG),
    // Nervous System — passed through from project config
    nervous_system: config.nervous_system,
    // Autonomous Engine — passed through from project config
    autonomous: config.autonomous,
    // Resource Monitor — passed through from project config (opt-in, absent = disabled)
    resource_monitor: config.resource_monitor,
    // Worker Comms — passed through (opt-in, absent = disabled)
    worker_comms: config.worker_comms,
    // Cost Guard — passed through (opt-in, absent = disabled)
    cost_guard: config.cost_guard,
    // Scheduler shadow-reducer (SCHED4) — passed through (opt-in, absent = disabled)
    scheduler: config.scheduler,
    // Gate — passed through (opt-in, default-off)
    gate: config.gate,
    // Approval — validated + defaulted via resolveApprovalConfig (Sprint 355 CFG-APR-WIRE)
    approval: resolveApprovalConfig(config),
    // ERP connector — passed through (opt-in, absent = disabled; secret-free)
    erp: config.erp,
    // Plan config (Sprint 276 PLAN-INT-1) — passed through (opt-in, absent = disabled)
    plan: config.plan,
    // born-464 (Alperen live-test 2026-07-02): the five overnight opt-in flag
    // blocks were declared on the type but never passed through in EITHER
    // resolver (this one nor mergeConfigs) — on the live path every flag
    // silently resolved to undefined (off) no matter what the user set.
    // W1-EXPERIENCE-ON (#492, Alperen 2026-07-06): the terminal experience layer
    // (live footer, mode indicator, approval card) ships ON by default — months
    // of UX stayed invisible behind absent config blocks (user-truth-audit §2).
    // An explicit { enabled: false } still turns it off (opt-out, not opt-in).
    repl_surface: config.repl_surface ?? { enabled: true, approvals: true },
    // TOOL-QB-FLIP (376-001, continuing #492's default-flip package): the
    // progressive-disclosure meta-tool surface ships ON by default too — same
    // opt-out rationale as repl_surface above (explicit { enabled: false } still
    // disables it).
    // born-607 P1 (advisor): FIELD-level default — a partial block like
    // `{ riskThreshold: 'safe' }` must not silently disable the default-ON surface.
    // born-612 (405-002 + CC son-mil): plugin-security bloğu passthrough (born-464 üçlüsü).
    plugins: config.plugins,
    tool_surface: { ...(config.tool_surface ?? {}), enabled: config.tool_surface?.enabled ?? true },
    deck_broker: config.deck_broker,
    training_trace: config.training_trace,
    live_trace: config.live_trace,
    // Sprint 369-005/008 follow-up (born-464 pattern): TOOL-CU + V1-strict-report
    // flag blocks — declared on the type in 369, wired here by CC hand-fix.
    computer_use: config.computer_use,
    worker_output_contract: config.worker_output_contract,
    // Tool allowlist (born-674, W674B 428-002) — task-based worker tool-surface
    // reduction. Opt-in, default-off: absent block ⇒ buildWorkerPrompt's
    // toolAllowlist stays undefined, full default tool surface (pre-674 bit-exact).
    tools: config.tools,
    // Messaging connectors (BOT-001) — passed through; tokens .deck-interpolated below.
    notify_connectors: (config as DeckentConfig).notify_connectors,
    notify_on_complete: (config as DeckentConfig).notify_on_complete,
    // Bot capabilities config — passed through (opt-in, default-off).
    bot_capabilities: (config as DeckentConfig).bot_capabilities,
    // Per-user identity↔RBAC config (ADR-092) — passed through (opt-in, default-off).
    identity: (config as DeckentConfig).identity,
    // Runtime Style
    deckent_style: config.deckent_style ?? 'sprint',
    // Terminal (Sprint 175) — deepMerge'd `config` already carries defaults from
    // createDefaultConfig(); fallback is defensive for hot-reload scenarios.
    terminal: config.terminal
      ? deepMerge(DEFAULT_TERMINAL_CONFIG, config.terminal as Partial<TerminalConfig>)
      : structuredClone(DEFAULT_TERMINAL_CONFIG),
    // Prompt tuning (Sprint 182 PQ-5 / F7) — mirrors the terminal pattern: user
    // override deep-merged over DEFAULT_PROMPT_CONFIG so unspecified fields keep
    // their defaults. Always populated so prompt-god-template consumers can rely
    // on `resolved.prompt.adr_min_relevance` being defined.
    prompt: config.prompt
      ? deepMerge(DEFAULT_PROMPT_CONFIG, config.prompt as Partial<PromptConfig>)
      : structuredClone(DEFAULT_PROMPT_CONFIG),
  };

  // ─── $DECK: interpolation ────────────────────────────────────────────
  // Sprint 202 Task 202-004: interpolation walks the object preserving all
  // numeric fields, so `token_throttle_ms` survives. Cast to the wider type
  // so callers (via `getTokenThrottleMs`) can read it without losing the
  // attached field on the cached object.
  const interpolated = interpolateConfig(resolved, root) as ResolvedConfigWithThrottle & ResolvedConfigWithChatProvider;
  if (interpolated.token_throttle_ms === undefined) {
    interpolated.token_throttle_ms = resolved.token_throttle_ms;
  }
  // Sprint 220 Task 220-001 — preserve chat_provider through interpolation.
  if (interpolated.chat_provider === undefined) {
    interpolated.chat_provider = resolved.chat_provider;
  }

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

  const globalConfig = await readJsonFile<Partial<DeckentConfig>>(resolveGlobalConfigReadPath());
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
  // CFG-1: normalize a legacy `mode` alias (e.g. pro_plan → economic) IN PLACE
  // before validation, mirroring the read path (loadConfig → resolveMode at the
  // top of mergeConfigs). VALID_MODES intentionally lists only canonical names,
  // so a legacy `mode` left on disk would otherwise make validateConfig reject
  // EVERY `config set <unrelated-key>` write. Normalizing here both unblocks the
  // write AND persists the canonical value, because callers (config set / import
  // / MCP set) write the SAME object back to disk after this returns. Canonical
  // and unknown values pass through unchanged (resolveMode is a no-op for them).
  if (typeof partial.mode === 'string') {
    const canonical = resolveMode(partial.mode);
    if (canonical !== partial.mode) {
      partial.mode = canonical as PlanMode;
    }
  }
  // ROUTE-V1-PURGE (ADR-G-006): same legacy-normalize for routing_engine — a
  // stale on-disk 'v1' must not reject an unrelated `config set` write.
  if ((partial as { routing_engine?: string }).routing_engine === 'v1') {
    (partial as { routing_engine?: string }).routing_engine = 'v2';
  }
  const merged = deepMerge(createDefaultConfig(), partial);
  validateConfig(merged);
}

// ─── Global Config ───────────────────────────────────────────────────

/**
 * Load a global config file (partial DeckentConfig).
 * Returns null when the file does not exist or contains malformed JSON.
 * Default `configPath` is dual-read (M1): platform-correct path, falling
 * back to the legacy `~/.deckent/config.json` — see
 * {@link resolveGlobalConfigReadPath}.
 */
export async function loadGlobalConfig(
  configPath?: string,
): Promise<Partial<DeckentConfig> | null> {
  const cfgPath = configPath ?? resolveGlobalConfigReadPath();
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

// ─── Config Regen Guard ──────────────────────────────────────────────

/**
 * Safe template defaults applied when regenerating a project config.
 * These represent deckent-dev project settings that must be preserved
 * even if the config file is lost or regenerated from scratch.
 *
 * Sprint 177 — Sprint 176 evidence: `git rm --cached` + regen caused the
 * template to overwrite all user fields including spawn_backend.
 */
export const REGEN_TEMPLATE_DEFAULTS: Record<string, unknown> = {
  spawn_backend: 'docker',
  dependency_pipeline_enabled: false,
  haiku_allowed: false,
  brain_planning: 'structured',
} as const;

export interface RegenConfigResult {
  /** Absolute path of the backup file created before regen */
  backupPath: string;
  /** The merged config written back to disk */
  merged: Record<string, unknown>;
  /** Keys that were missing from the existing config and were added from template */
  added: string[];
}

/**
 * Safely regenerate the project config by merging the existing config OVER the
 * template defaults. User fields are never overwritten — only missing fields are
 * filled from the template. A timestamped backup is created before any write.
 *
 * Sprint 176 root cause: `deckent init` regenerated from template, overwriting
 * all user fields. This function prevents that by always treating existing
 * config as the higher-priority source.
 *
 * @param projectRoot — project root directory; defaults to process.cwd()
 * @returns RegenConfigResult with backupPath, merged config, and added keys
 */
export function regenerateConfigSafe(projectRoot?: string): RegenConfigResult {
  const root = resolve(projectRoot ?? process.cwd());
  const configPath = join(root, PROJECT_CONFIG_PATH);

  let existingConfig: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      const raw = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(raw) as unknown;
      if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        existingConfig = parsed as Record<string, unknown>;
      }
    } catch {
      // Unparseable config — treat as empty, template fills in all fields
    }

    const iso = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
    const backupPath = `${configPath}.bak.regen-${iso}`;
    copyFileSync(configPath, backupPath);

    const added = Object.keys(REGEN_TEMPLATE_DEFAULTS).filter(
      (k) => !(k in existingConfig),
    );

    // Template is the base; existing config overlays it — user fields always win
    const merged = deepMerge(
      REGEN_TEMPLATE_DEFAULTS as Record<string, unknown>,
      existingConfig,
    ) as Record<string, unknown>;

    writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

    return { backupPath, merged, added };
  }

  // Config file does not exist — write template defaults as the new config
  const deckentDir = join(root, '.deckent');
  if (!existsSync(deckentDir)) {
    // mkdirSync would require importing it — use writeFileSync path below which
    // will throw naturally if the parent dir is missing (desired behaviour)
  }

  const merged = structuredClone(REGEN_TEMPLATE_DEFAULTS) as Record<string, unknown>;
  const iso = new Date().toISOString().replace(/:/g, '-').replace(/\./g, '-');
  const backupPath = `${configPath}.bak.regen-${iso}`;

  writeFileSync(configPath, JSON.stringify(merged, null, 2) + '\n', 'utf-8');

  return { backupPath, merged, added: Object.keys(REGEN_TEMPLATE_DEFAULTS) };
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
  worker_memory_limit_by_kind: {
    description: 'Opt-in per-kind Docker memory limits. Keys are canonical TaskKind values. Swap is auto-derived at limit × 1.5.',
    type: 'Record<string, string>',
    default: undefined,
    category: 'Sprint',
  },
  worker_memory_limit: {
    description: 'Default per-worker Docker memory limit (docker --memory), e.g. "2g". Falls back to 4g when unset.',
    type: 'string',
    default: undefined,
    category: 'Sprint',
  },
  brain_provider: {
    description: 'AI provider used for the Brain orchestrator (planning and evaluation).',
    type: "'claude' | 'codex' | 'gemini' | 'ollama'",
    default: 'claude',
    options: ['claude', 'codex', 'gemini', 'ollama'],
    category: 'Provider',
  },
  chat_provider: {
    description: 'Native REPL provider override (deckent argümansız). Fallback chain: chat_provider → brain_provider → claude. Set independently from brain_provider to decouple planner from REPL (e.g. brain=opus, repl=ollama).',
    type: "'claude' | 'codex' | 'gemini' | 'ollama' | undefined",
    default: undefined,
    options: ['claude', 'codex', 'gemini', 'ollama'],
    category: 'Provider',
  },
  worker_provider: {
    description: 'Default AI provider for worker agents executing tasks.',
    type: "'claude' | 'codex' | 'gemini' | 'ollama'",
    default: 'claude',
    options: ['claude', 'codex', 'gemini', 'ollama'],
    category: 'Provider',
  },
  fallback_provider: {
    description: 'Provider to use when the primary provider is unavailable.',
    type: "'claude' | 'codex' | 'gemini' | 'ollama' | undefined",
    default: undefined,
    options: ['claude', 'codex', 'gemini', 'ollama'],
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
    description: 'Active runtime style: "sprint" for developer orchestration, "task" for one-shot life assistant, "process" for continuous request-handling (ERP / business automation via MCP + REST).',
    type: "'sprint' | 'task' | 'process'",
    default: 'sprint',
    options: ['sprint', 'task', 'process'],
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

  // ROUTE-V1-PURGE (ADR-G-006): coerce the retired routing_engine 'v1' → 'v2'
  // (legacy on-disk value; validateConfig now rejects 'v1'). Mirror of loadConfig.
  if ((config as { routing_engine?: string }).routing_engine === 'v1') {
    (config as { routing_engine?: string }).routing_engine = 'v2';
  }

  validateConfig(config);

  const activeModeConfig = (config.modes[config.mode] ?? config.modes['performance']) as PlanModeConfig;

  // Sprint 179 W2-4: resolve coverage gates from the raw user partials
  // (NOT the post-default-merge config) so user-supplied legacy
  // `coverage_threshold` correctly seeds `coverage_aspirational` even though
  // `createDefaultConfig` pre-populates an aspirational default of 90.
  const userCoverageInput: Partial<DeckentConfig> = {
    ...(globalConfig ?? {}),
    ...(projectConfig ?? {}),
  };
  const coverageGates = resolveCoverageGates(userCoverageInput);

  const merged: ResolvedConfigWithThrottle & ResolvedConfigWithChatProvider & ResolvedConfigWithMaxWorkers = {
    mode: config.mode,
    activeModeConfig,
    modes: config.modes,
    language: config.language ?? DEFAULT_LANGUAGE,
    projectName: config.projectName ?? 'deckent-project',
    projectRoot: resolve(process.cwd()),
    version: config.version ?? DECKENT_VERSION,
    // Sprint 319 (B-MAXWORKERS-WIRE): carry the top-level explicit worker-count
    // override (see loadConfig + resolveEffectiveWorkers). Absent → undefined.
    max_workers: (config as DeckentConfigWithMaxWorkers).max_workers,
    // Task 429-006 (PLNR1): carry the top-level explicit brain_planning override
    // (see loadConfig + resolveBrainPlanningMode). Absent → undefined.
    brain_planning: config.brain_planning,
    auto_docs: config.auto_docs ?? { ...DEFAULT_AUTO_DOCS },
    skills: config.skills,
    // F1-012 — pass grouped `providers` (incl. config-driven `registry`) through.
    providers: config.providers,
    // Sprint 220 Task 220-001 — optional native REPL provider override.
    chat_provider: (config as DeckentConfigWithChatProvider).chat_provider,
    // Sprint 179 W2-4: see resolveCoverageGates docstring for split semantics.
    ...coverageGates,
    max_reroutes: config.max_reroutes ?? 3,
    reroute_on_tech_debt: config.reroute_on_tech_debt ?? false,
    sprint_timeout_minutes: config.sprint_timeout_minutes ?? 0,
    adaptive_thresholds: config.adaptive_thresholds ?? false,
    agent_min_score: config.agent_min_score ?? 5,
    adaptive_config: config.adaptive_config ?? { min_samples: 3, no_go_threshold: 0.3, coverage_lookback: 3 },
    deckent_style: config.deckent_style ?? 'sprint',
    // Sprint 156: default true unless overridden by user/project config
    dependency_pipeline_enabled: config.dependency_pipeline_enabled ?? true,
    // Sprint 202 Task 202-004 — pre-spawn pacing (computeBackoff wire).
    token_throttle_ms:
      (config as DeckentConfigWithThrottle).token_throttle_ms ?? 500,
    // Terminal (Sprint 175) — deepMerge applies any partial project override on
    // top of DEFAULT_TERMINAL_CONFIG so unspecified keys inherit defaults,
    // mirroring the model_strategy nested-merge pattern.
    terminal: config.terminal
      ? deepMerge(DEFAULT_TERMINAL_CONFIG, config.terminal as Partial<TerminalConfig>)
      : structuredClone(DEFAULT_TERMINAL_CONFIG),
    // Resource Monitor — passed through (opt-in, absent = disabled)
    resource_monitor: config.resource_monitor,
    // Worker Comms — passed through (opt-in, absent = disabled)
    worker_comms: config.worker_comms,
    // Cost Guard — passed through (opt-in, absent = disabled)
    cost_guard: config.cost_guard,
    // Scheduler shadow-reducer (SCHED4) — passed through (opt-in, absent = disabled)
    scheduler: config.scheduler,
    // Gate — passed through (opt-in, default-off)
    gate: config.gate,
    // Approval — validated + defaulted via resolveApprovalConfig (Sprint 355 CFG-APR-WIRE)
    approval: resolveApprovalConfig(config),
    // ERP connector — passed through (opt-in, absent = disabled; secret-free)
    erp: config.erp,
    // Plan config (Sprint 276 PLAN-INT-1) — passed through (opt-in, absent = disabled)
    plan: config.plan,
    // born-464 (Alperen live-test 2026-07-02): the five overnight opt-in flag
    // blocks below were declared on the type but never passed through here —
    // hermetic tests injected configs directly, so on the LIVE loadConfig path
    // every flag silently resolved to undefined (off) no matter what the user
    // set. Each is a plain pass-through: absent = disabled, exactly like
    // resource_monitor/worker_comms above.
    // W1-EXPERIENCE-ON (#492, Alperen 2026-07-06): the terminal experience layer
    // (live footer, mode indicator, approval card) ships ON by default — months
    // of UX stayed invisible behind absent config blocks (user-truth-audit §2).
    // An explicit { enabled: false } still turns it off (opt-out, not opt-in).
    repl_surface: config.repl_surface ?? { enabled: true, approvals: true },
    // TOOL-QB-FLIP (376-001, continuing #492's default-flip package): the
    // progressive-disclosure meta-tool surface ships ON by default too — same
    // opt-out rationale as repl_surface above (explicit { enabled: false } still
    // disables it).
    // born-607 P1 (advisor): FIELD-level default — a partial block like
    // `{ riskThreshold: 'safe' }` must not silently disable the default-ON surface.
    // born-612 (405-002 + CC son-mil): plugin-security bloğu passthrough (born-464 üçlüsü).
    plugins: config.plugins,
    tool_surface: { ...(config.tool_surface ?? {}), enabled: config.tool_surface?.enabled ?? true },
    deck_broker: config.deck_broker,
    training_trace: config.training_trace,
    live_trace: config.live_trace,
    // Sprint 369-005/008 follow-up (born-464 pattern) — see loadConfig twin above.
    computer_use: config.computer_use,
    worker_output_contract: config.worker_output_contract,
    // Tool allowlist (born-674, W674B 428-002) — see loadConfig twin above.
    tools: config.tools,
  };
  return merged;
}

