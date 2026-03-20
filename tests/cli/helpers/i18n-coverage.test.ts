import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load both i18n JSON files
const I18N_DIR = resolve(process.cwd(), '.deckent/i18n');

function loadJson(filename: string): Record<string, string> {
  const content = readFileSync(resolve(I18N_DIR, filename), 'utf-8');
  return JSON.parse(content) as Record<string, string>;
}

describe('i18n JSON files', () => {
  let en: Record<string, string>;
  let tr: Record<string, string>;

  beforeEach(() => {
    en = loadJson('en.json');
    tr = loadJson('tr.json');
  });

  it('should have 80+ keys in en.json', () => {
    expect(Object.keys(en).length).toBeGreaterThanOrEqual(80);
  });

  it('should have 80+ keys in tr.json', () => {
    expect(Object.keys(tr).length).toBeGreaterThanOrEqual(80);
  });

  it('should have the same keys in both files', () => {
    const enKeys = Object.keys(en).sort();
    const trKeys = Object.keys(tr).sort();
    expect(enKeys).toEqual(trKeys);
  });

  it('should have no empty values in en.json', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(value, `en.json key "${key}" is empty`).toBeTruthy();
    }
  });

  it('should have no empty values in tr.json', () => {
    for (const [key, value] of Object.entries(tr)) {
      expect(value, `tr.json key "${key}" is empty`).toBeTruthy();
    }
  });

  it('should have all original 6 keys preserved', () => {
    const originalKeys = [
      'sprint_started',
      'sprint_complete',
      'task_done',
      'task_nogo',
      'plan_approved',
      'plan_rejected',
    ];
    for (const key of originalKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have CLI hint keys', () => {
    const hintKeys = ['hint.COMPLETE', 'hint.EXECUTE', 'hint.PLAN', 'hint.IDLE'];
    for (const key of hintKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have status command keys', () => {
    const statusKeys = [
      'status.tasks_running',
      'status.sprint_active',
      'status.no_sprint',
      'status.no_active_sprint',
      'status.dashboard_read_failed',
      'status.task_pending',
      'status.task_executing',
      'status.task_claimed',
      'status.task_testing',
      'status.task_paused',
      'status.workers_active',
      'status.sprint_phase',
    ];
    for (const key of statusKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have plan command keys', () => {
    const planKeys = [
      'plan.sprint_planned',
      'plan.reasoning',
      'plan.planning_mode',
      'plan.note_sprint_size',
      'plan.approved',
      'plan.rejected',
      'plan.no_tasks',
      'plan.ai_fallback',
    ];
    for (const key of planKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have start command keys', () => {
    const startKeys = [
      'start.sandbox_not_implemented',
      'start.preflight_failed',
      'start.use_force',
      'start.watch_ignored_dry_run',
      'start.sprint_planned',
      'start.reasoning',
      'start.planning_mode',
      'start.workers_info',
      'start.dry_run_complete',
      'start.watch_window_created',
      'start.watch_no_tmux',
      'start.sprint_failed',
    ];
    for (const key of startKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have doctor command keys', () => {
    const doctorKeys = [
      'doctor.checks_passed',
      'doctor.check_ok',
      'doctor.check_fail',
      'doctor.check_warn',
      'doctor.profile_header',
      'doctor.all_checks_passed',
      'doctor.some_checks_failed',
    ];
    for (const key of doctorKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have init command keys', () => {
    const initKeys = [
      'init.auto_detecting',
      'init.recommendation',
      'init.initialized',
      'init.next_steps',
      'init.next_step_directives',
      'init.next_step_start',
      'init.already_initialized',
      'init.creating_files',
    ];
    for (const key of initKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have cleanup command keys', () => {
    const cleanupKeys = [
      'cleanup.decay_complete',
      'cleanup.archived_sprints',
      'cleanup.removed_items',
      'cleanup.complete',
      'cleanup.nothing_to_clean',
      'cleanup.cleaning_locks',
      'cleanup.locks_removed',
    ];
    for (const key of cleanupKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have spawn command keys', () => {
    const spawnKeys = [
      'spawn.worker_spawned',
      'spawn.already_running',
      'spawn.max_workers_reached',
    ];
    for (const key of spawnKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have kill command keys', () => {
    const killKeys = ['kill.worker_killed', 'kill.worker_not_found', 'kill.all_workers_killed'];
    for (const key of killKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have attach command keys', () => {
    const attachKeys = ['attach.no_active_session', 'attach.attaching'];
    for (const key of attachKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have error message keys', () => {
    const errorKeys = [
      'error.file_not_found',
      'error.permission_denied',
      'error.tmux_error',
      'error.config_parse_error',
      'error.network_error',
      'error.timeout',
      'error.invalid_json',
      'error.directives_missing',
      'error.sprint_in_progress',
      'error.model_not_available',
      'error.lock_conflict',
      'error.boundary_violation',
      'error.unknown',
    ];
    for (const key of errorKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have dashboard message keys', () => {
    const dashKeys = [
      'dashboard.progress',
      'dashboard.usage',
      'dashboard.alert_stale_worker',
      'dashboard.alert_boundary_violation',
      'dashboard.alert_stale_lock',
      'dashboard.no_alerts',
      'dashboard.sprint_eta',
      'dashboard.tasks_queued',
    ];
    for (const key of dashKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have config command keys', () => {
    const configKeys = ['config.set_value', 'config.invalid', 'config.show_all', 'config.reset_complete'];
    for (const key of configKeys) {
      expect(en).toHaveProperty(key);
      expect(tr).toHaveProperty(key);
    }
  });

  it('should have {placeholder} variables in matching keys', () => {
    // Keys that use {id} placeholder should have it in both languages
    const keysWithId = ['sprint_started', 'sprint_complete', 'task_done', 'task_nogo'];
    for (const key of keysWithId) {
      expect(en[key]).toMatch(/\{id\}/);
      expect(tr[key]).toMatch(/\{id\}/);
    }
  });

  it('should have tr translations that differ from en (actually translated)', () => {
    // Spot-check a few important keys to ensure they are different
    expect(en['sprint_started']).not.toBe(tr['sprint_started']);
    expect(en['task_done']).not.toBe(tr['task_done']);
    expect(en['error.file_not_found']).not.toBe(tr['error.file_not_found']);
    expect(en['dashboard.no_alerts']).not.toBe(tr['dashboard.no_alerts']);
  });

  it('should preserve {placeholder} patterns consistently across both files', () => {
    const enKeys = Object.keys(en);
    for (const key of enKeys) {
      const enPlaceholders = (en[key].match(/\{(\w+)\}/g) ?? []).sort();
      const trPlaceholders = (tr[key].match(/\{(\w+)\}/g) ?? []).sort();
      expect(enPlaceholders, `Placeholder mismatch for key "${key}"`).toEqual(trPlaceholders);
    }
  });

  it('should have all string values (no nested objects)', () => {
    for (const [key, value] of Object.entries(en)) {
      expect(typeof value, `en.json["${key}"] should be a string`).toBe('string');
    }
    for (const [key, value] of Object.entries(tr)) {
      expect(typeof value, `tr.json["${key}"] should be a string`).toBe('string');
    }
  });
});
