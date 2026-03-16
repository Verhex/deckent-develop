import { readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  PROJECT_CONFIG_PATH,
  GLOBAL_CONFIG_PATH,
  DEFAULT_LANGUAGE,
  DEFAULT_MODE,
  DECKENT_VERSION,
  SUPPORTED_LANGUAGES,
} from './constants.js';
import type {
  DeckentConfig,
  PlanMode,
  PlanModeConfig,
  ResolvedConfig,
  UsageThresholds,
} from './types.js';

// ─── Default Mode Definitions (Blueprint 13) ────────────────────────

const VALID_MODES: readonly PlanMode[] = ['max_plan', 'max5x_plan', 'pro_plan', 'api'] as const;
const VALID_MODELS = ['opus', 'sonnet', 'haiku'] as const;

export const DEFAULT_MODES: Record<PlanMode, PlanModeConfig> = {
  max_plan: {
    max_workers: 8,
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 0.8, weekly: 0.6 },
  },
  max5x_plan: {
    max_workers: 5,
    brain_model: 'sonnet',
    default_model: 'sonnet',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 0.7, weekly: 0.5 },
  },
  pro_plan: {
    max_workers: 3,
    brain_model: 'sonnet',
    default_model: 'sonnet',
    haiku_allowed: false,
    usage_thresholds: { '5hr': 0.6, weekly: 0.4 },
  },
  api: {
    max_workers: 10,
    brain_model: 'opus',
    default_model: 'sonnet',
    haiku_allowed: true,
    usage_thresholds: { '5hr': 1.0, weekly: 1.0 },
    budget_per_sprint: 5.0,
    requires: 'ANTHROPIC_API_KEY',
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

export function validateConfig(config: DeckentConfig): void {
  const errors: string[] = [];

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

    if (typeof mc.max_workers !== 'number' || mc.max_workers < 1 || mc.max_workers > 20) {
      errors.push(`${prefix}.max_workers must be a number between 1 and 20`);
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

    if (modeName === 'api' && mc.budget_per_sprint !== undefined) {
      if (typeof mc.budget_per_sprint !== 'number' || mc.budget_per_sprint <= 0) {
        errors.push(`${prefix}.budget_per_sprint must be a positive number`);
      }
    }
  }

  if (errors.length > 0) {
    throw new ConfigValidationError(errors);
  }
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
  };
}

export function validatePartialConfig(partial: Partial<DeckentConfig>): void {
  const merged = deepMerge(createDefaultConfig(), partial);
  validateConfig(merged);
}
