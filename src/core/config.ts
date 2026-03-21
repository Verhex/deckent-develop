import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import {
  PROJECT_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_LANGUAGE,
  DEFAULT_MODE,
  DECKENT_VERSION,
  SUPPORTED_LANGUAGES,
} from './constants.js';
import type {
  AutoDocsConfig,
  DeckentConfig,
  PlanMode,
  PlanModeConfig,
  ResolvedConfig,
  SystemProfile,
  UsageThresholds,
} from './types.js';

// ─── Default Auto Docs Config ───────────────────────────────────────
export const DEFAULT_AUTO_DOCS: AutoDocsConfig = {
  tier1: true,
  tier2: false,
  tier3: false,
};

// ─── Default Mode Definitions (Blueprint 13) ────────────────────────

const VALID_MODES: readonly PlanMode[] = ['max_plan', 'max5x_plan', 'pro_plan', 'api'] as const;
const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;
const VALID_BRAIN_PLANNING = ['ai', 'structured', 'auto'] as const;

export const DEFAULT_MODES: Record<PlanMode, PlanModeConfig> = {
  max_plan: {
    max_workers: 8,
    brain_model: 'opus',
    default_model: 'opus',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
    brain_planning: 'auto',
  },
  max5x_plan: {
    max_workers: 5,
    brain_model: 'sonnet',
    default_model: 'opus',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 0.7, weekly: 0.5 },
    brain_planning: 'auto',
  },
  pro_plan: {
    max_workers: 3,
    brain_model: 'sonnet',
    default_model: 'sonnet',
    haiku_allowed: false,
    usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
    brain_planning: 'auto',
  },
  api: {
    max_workers: 10,
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 1.0, weekly: 1.0 },
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

export function deepMerge<T>(base: T, override: Partial<T>): T {
  const result = structuredClone(base);
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

export function validateConfig(config: DeckentConfig): string[] {
  const errors: string[] = [];
  const maxWorkersWarnings: string[] = [];

  if (!VALID_MODES.includes(config.mode)) {
    errors.push(`Invalid mode "${config.mode}". Must be one of: ${VALID_MODES.join(', ')}`);
  }

  if (config.language !== undefined && !(SUPPORTED_LANGUAGES as readonly string[]).includes(config.language)) {
    errors.push(`Invalid language "${config.language}". Must be one of: ${SUPPORTED_LANGUAGES.join(', ')}`);
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
      errors.push(`${prefix}.brain_model must be one of: ${VALID_MODELS.join(', ')}`);
    }

    if (!(VALID_MODELS as readonly string[]).includes(mc.default_model)) {
      errors.push(`${prefix}.default_model must be one of: ${VALID_MODELS.join(', ')}`);
    }

    if (typeof mc.haiku_allowed !== 'boolean') {
      errors.push(`${prefix}.haiku_allowed must be a boolean`);
    }

    const thresholds: UsageThresholds | undefined = mc.usage_thresholds;
    if (thresholds) {
      if (typeof thresholds['5hr'] !== 'number' || thresholds['5hr'] < 0 || thresholds['5hr'] > 1) {
        errors.push(`${prefix}.usage_thresholds.5hr must be a number between 0 and 1`);
      }
      if (typeof thresholds.weekly !== 'number' || thresholds.weekly < 0 || thresholds.weekly > 1) {
        errors.push(`${prefix}.usage_thresholds.weekly must be a number between 0 and 1`);
      }
    }

    if (mc.brain_planning !== undefined &&
        !(VALID_BRAIN_PLANNING as readonly string[]).includes(mc.brain_planning)) {
      errors.push(`${prefix}.brain_planning must be one of: ${VALID_BRAIN_PLANNING.join(', ')}`);
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
  if (!existsSync(filePath)) {
    return null;
  }

  try {
    const content = await readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to read config file "${filePath}": ${message}`);
  }
}

// ─── Public API ──────────────────────────────────────────────────────

export function createDefaultConfig(): DeckentConfig {
  return {
    mode: DEFAULT_MODE,
    modes: structuredClone(DEFAULT_MODES),
  };
}

export function getDefaultConfig(): DeckentConfig {
  return createDefaultConfig();
}

export function getDefaultModes(): Record<PlanMode, PlanModeConfig> {
  return structuredClone(DEFAULT_MODES);
}

export async function loadConfig(projectRoot?: string): Promise<ResolvedConfig> {
  const root = resolve(projectRoot ?? process.cwd());

  let config = createDefaultConfig();

  const globalConfig = await readJsonFile<Partial<DeckentConfig>>(GLOBAL_CONFIG_PATH);
  if (globalConfig) {
    config = deepMerge(config, globalConfig);
  }

  const projectConfigPath = join(root, PROJECT_CONFIG_PATH);
  const projectConfig = await readJsonFile<Partial<DeckentConfig>>(projectConfigPath);
  if (projectConfig) {
    config = deepMerge(config, projectConfig);
  }

  validateConfig(config);

  const activeModeConfig = config.modes[config.mode];

  if (config.mode === 'api' && activeModeConfig.requires) {
    const envVar = activeModeConfig.requires;
    if (!process.env[envVar]) {
      throw new ConfigValidationError([
        `API mode requires environment variable "${envVar}" to be set`,
      ]);
    }
  }

  return {
    mode: config.mode,
    activeModeConfig,
    modes: config.modes,
    language: config.language ?? DEFAULT_LANGUAGE,
    projectName: config.projectName ?? 'deckent-project',
    projectRoot: root,
    version: config.version ?? DECKENT_VERSION,
    auto_docs: config.auto_docs ?? { ...DEFAULT_AUTO_DOCS },
    spawn_backend: config.spawn_backend,
    skills: config.skills,
  };
}

export function validatePartialConfig(partial: Partial<DeckentConfig>): void {
  const merged = deepMerge(createDefaultConfig(), partial);
  validateConfig(merged);
}

// ─── Global Config ───────────────────────────────────────────────────

/**
 * Load a global config file (partial DeckentConfig).
 * Returns null when the file does not exist.
 * Throws on malformed JSON.
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

  validateConfig(config);

  const activeModeConfig = config.modes[config.mode];

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
  };
}
