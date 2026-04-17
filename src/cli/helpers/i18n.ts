/**
 * i18n.ts — Unified i18n entry point for CLI commands.
 *
 * Consolidates language detection and message retrieval.
 * Priority: config language → LC_ALL env → LANG env → 'en'
 *
 * ADR-010: no external i18n libs — plain TypeScript only.
 * ADR-008: lives in cli/helpers/ (not core/) since it reads CLI config.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMessage, getLanguage } from './messages.js';

export { getMessage, getLanguage };

// ─── Language Detection ────────────────────────────────────────────

/**
 * Detect the effective language for the given project root.
 *
 * Priority chain:
 *  1. `.deckent/config.json` → `language` field (if set + supported)
 *  2. LC_ALL environment variable
 *  3. LANG environment variable
 *  4. Default: 'en'
 *
 * Normalizes locale strings: 'tr_TR.UTF-8' → 'tr', 'en_US.UTF-8' → 'en'
 */
export function detectLang(root: string): string {
  // 1. Config-based language preference
  try {
    const configPath = join(root, '.deckent', 'config.json');
    if (existsSync(configPath)) {
      const raw = JSON.parse(readFileSync(configPath, 'utf-8')) as { language?: string };
      if (raw.language) {
        return getLanguage(raw.language);
      }
    }
  } catch {
    // fall through to env detection
  }

  // 2 & 3. Environment variable detection (delegated to getLanguage)
  return getLanguage();
}

// ─── Typed Message Map ──────────────────────────────────────────────

/** All message keys exposed by the CLI i18n system. */
export type MessageKey =
  // hints
  | 'hint.COMPLETE' | 'hint.EXECUTE' | 'hint.PLAN' | 'hint.IDLE'
  // status
  | 'status.tasks_running' | 'status.sprint_active' | 'status.no_sprint'
  | 'status.no_active_sprint' | 'status.dashboard_read_failed'
  // start
  | 'start.sandbox_not_implemented' | 'start.use_force'
  | 'start.watch_ignored_dry_run' | 'start.sprint_planned' | 'start.reasoning'
  | 'start.planning_mode' | 'start.workers_info' | 'start.dry_run_complete'
  | 'start.watch_window_created' | 'start.watch_no_tmux'
  | 'start.zero_config_created' | 'start.zero_config_directives_exist'
  | 'start.zero_config_cleanup'
  // plan
  | 'plan.sprint_planned' | 'plan.reasoning' | 'plan.planning_mode'
  | 'plan.note_sprint_size' | 'plan.approved' | 'plan.rejected'
  // init
  | 'init.select_language' | 'init.select_plan' | 'init.enter_project_name'
  | 'init.auto_detecting' | 'init.recommendation' | 'init.initialized'
  | 'init.next_steps' | 'init.next_step_directives' | 'init.next_step_start'
  // doctor
  | 'doctor.checks_passed'
  // cleanup / finalize / attach / kill / spawn
  | 'cleanup.decay_complete' | 'cleanup.archived_sprints' | 'cleanup.removed_items' | 'cleanup.complete'
  | 'finalize.no_tasks' | 'finalize.complete'
  | 'attach.no_active_session'
  | 'kill.worker_killed' | 'kill.worker_not_found' | 'kill.task_status_updated'
  | 'kill.task_not_found' | 'kill.locks_released' | 'kill.prompts_cleaned'
  | 'kill.all_killed' | 'kill.no_active_workers'
  | 'spawn.worker_spawned'
  // set-directives
  | 'set_directives.updated' | 'set_directives.file_not_found'
  | 'set_directives.empty_content' | 'set_directives.no_input'
  // errors
  | 'error.tmux_not_found' | 'error.claude_not_found' | 'error.no_directives'
  | 'error.config_invalid' | 'error.scope_violation' | 'error.lock_conflict'
  | 'error.usage_exceeded' | 'error.build_failed' | 'error.git_not_found'
  | 'error.node_version_low';

/**
 * Returns a bound message getter for the given language.
 * Convenience wrapper so commands can call `t('key', vars)` after:
 *   `const t = getMessages(lang);`
 */
export function getMessages(lang: string): (key: MessageKey, vars?: Record<string, string>) => string {
  return (key: MessageKey, vars?: Record<string, string>) => getMessage(key, lang, vars);
}

// ─── TR/EN Parity Helpers (for testing) ────────────────────────────

/** Supported language codes. */
export const SUPPORTED_LANGS = ['en', 'tr'] as const;
export type SupportedLang = (typeof SUPPORTED_LANGS)[number];

/** Returns true if the given lang code is supported. */
export function isSupportedLang(lang: string): lang is SupportedLang {
  return (SUPPORTED_LANGS as readonly string[]).includes(lang);
}
