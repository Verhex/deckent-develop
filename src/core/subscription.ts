import { spawnSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { PROJECT_CONFIG_PATH } from './constants.js';
import type {
  SubscriptionProfile,
  PlanMode,
} from './types.js';

// ─── Mode Compatibility ───────────────────────────────────────────────

const MAX_MODES: readonly PlanMode[] = ['max_plan', 'max5x_plan'];
const PRO_MODES: readonly PlanMode[] = ['pro_plan'];

/**
 * Check if the detected subscription is compatible with the configured mode.
 * Returns a warning message if incompatible, null otherwise.
 */
export function checkModeCompatibility(
  profile: SubscriptionProfile,
  configMode: PlanMode,
): string | null {
  if (profile.detected === 'unknown') return null;

  const isMaxMode = (MAX_MODES as readonly string[]).includes(configMode);
  const isProMode = (PRO_MODES as readonly string[]).includes(configMode);

  if (profile.detected === 'pro' && isMaxMode) {
    return `Warning: Config mode "${configMode}" requires Max subscription, but only Pro was detected. Performance may be limited.`;
  }

  if (profile.detected === 'max' && isProMode) {
    return `Note: Config mode "${configMode}" uses Pro plan settings, but Max subscription is available. Consider upgrading to max_plan for better performance.`;
  }

  return null;
}

// ─── CLI Detection ────────────────────────────────────────────────────

function isClaudeCliAvailable(): boolean {
  try {
    const result = spawnSync('claude', ['--version'], {
      encoding: 'utf-8',
      timeout: 5_000,
    });
    return result.status === 0 && result.error === undefined;
  } catch {
    return false;
  }
}

// ─── Core Detection ───────────────────────────────────────────────────

/**
 * Detect Claude subscription tier by probing opus model availability.
 *
 * - Runs: claude -p "respond with just your model name" --model opus
 * - Success (exit 0) → Max subscription (opus available)
 * - Failure (non-zero exit) → Pro subscription (opus not available)
 * - CLI not found → Unknown
 * - Timeout (15s) → Unknown with graceful fallback
 */
export function detectSubscription(): SubscriptionProfile {
  const testedAt = new Date().toISOString();

  if (!isClaudeCliAvailable()) {
    return {
      detected: 'unknown',
      opusAvailable: false,
      testedAt,
      method: 'cli_missing',
    };
  }

  let result: ReturnType<typeof spawnSync>;
  try {
    result = spawnSync(
      'claude',
      ['-p', 'respond with just your model name', '--model', 'opus'],
      {
        encoding: 'utf-8',
        timeout: 15_000,
      },
    );
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const isTimeout =
      errMsg.includes('ETIMEDOUT') ||
      errMsg.includes('timeout') ||
      errMsg.includes('SIGTERM');
    return {
      detected: 'unknown',
      opusAvailable: false,
      testedAt,
      method: isTimeout ? 'timeout' : 'error',
    };
  }

  // spawnSync sets error when the process could not be spawned or timed out
  if (result.error) {
    const errMsg = result.error.message ?? '';
    const isTimeout =
      errMsg.includes('ETIMEDOUT') ||
      errMsg.includes('timeout') ||
      result.signal === 'SIGTERM';
    return {
      detected: 'unknown',
      opusAvailable: false,
      testedAt,
      method: isTimeout ? 'timeout' : 'error',
    };
  }

  if (result.status === 0) {
    return {
      detected: 'max',
      opusAvailable: true,
      testedAt,
      method: 'opus_probe',
    };
  }

  return {
    detected: 'pro',
    opusAvailable: false,
    testedAt,
    method: 'opus_probe',
  };
}

// ─── Config Persistence ───────────────────────────────────────────────

/**
 * Save the subscription profile to the project config file.
 * Merges with existing config — does not overwrite other fields.
 */
export async function saveSubscriptionToConfig(
  profile: SubscriptionProfile,
  projectRoot?: string,
): Promise<void> {
  const root = resolve(projectRoot ?? process.cwd());
  const configPath = join(root, PROJECT_CONFIG_PATH);

  let existing: Record<string, unknown> = {};

  if (existsSync(configPath)) {
    try {
      const { readFile } = await import('node:fs/promises');
      const raw = await readFile(configPath, 'utf-8');
      existing = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      // If we can't read the existing config, start fresh
      existing = {};
    }
  }

  existing['subscription'] = profile;

  await writeFile(configPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');
}
