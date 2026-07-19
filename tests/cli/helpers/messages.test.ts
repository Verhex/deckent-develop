import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getMessage, getLanguage } from '../../../src/cli/helpers/messages.js';

// All keys defined in messages.ts
const KNOWN_KEYS = [
  'hint.COMPLETE',
  'hint.EXECUTE',
  'hint.PLAN',
  'hint.IDLE',
  'spawn.worker_spawned',
  'kill.worker_killed',
  'kill.worker_not_found',
  'attach.no_active_session',
  'status.tasks_running',
  'status.sprint_active',
  'status.no_sprint',
  'status.no_active_sprint',
  'status.dashboard_read_failed',
  'start.sandbox_not_implemented',
  'start.use_force',
  'start.watch_ignored_dry_run',
  'start.sprint_planned',
  'start.reasoning',
  'start.planning_mode',
  'start.workers_info',
  'start.dry_run_complete',
  'start.watch_window_created',
  'start.watch_no_tmux',
  'plan.sprint_planned',
  'plan.reasoning',
  'plan.planning_mode',
  'plan.note_sprint_size',
  'plan.approved',
  'plan.rejected',
  'cleanup.decay_complete',
  'cleanup.archived_sprints',
  'cleanup.removed_items',
  'cleanup.complete',
  'doctor.checks_passed',
  'init.auto_detecting',
  'init.recommendation',
  'init.initialized',
  'init.next_steps',
  'init.next_step_directives',
  'init.next_step_start',
] as const;

// ─── getMessage ───────────────────────────────────────────────────────────────

describe('getMessage', () => {
  describe('key lookup', () => {
    it('returns English message for hint.COMPLETE with lang=en', () => {
      const result = getMessage('hint.COMPLETE', 'en');
      expect(result).toContain('Sprint complete');
      expect(result).toContain('deckent retro');
    });

    it('returns Turkish message for hint.COMPLETE with lang=tr', () => {
      const result = getMessage('hint.COMPLETE', 'tr');
      expect(result).toContain('tamamlandı');
      expect(result).toContain('deckent retro');
    });

    it('returns English for hint.EXECUTE in en', () => {
      expect(getMessage('hint.EXECUTE', 'en')).toContain('Tasks running');
    });

    it('returns Turkish for hint.IDLE in tr', () => {
      expect(getMessage('hint.IDLE', 'tr')).toContain('run planlayın');
    });

    it('returns English for hint.PLAN in en', () => {
      expect(getMessage('hint.PLAN', 'en')).toContain('deckent start');
    });

    it('returns English for status.no_sprint in en', () => {
      expect(getMessage('status.no_sprint', 'en')).toBe('No active run (sprint)');
    });

    it('returns Turkish for status.no_sprint in tr', () => {
      expect(getMessage('status.no_sprint', 'tr')).toBe('Aktif run (sprint) yok');
    });

    it('returns English for attach.no_active_session in en', () => {
      expect(getMessage('attach.no_active_session', 'en')).toContain('No active session');
    });

    it('returns the key itself for a missing key', () => {
      expect(getMessage('nonexistent.key', 'en')).toBe('nonexistent.key');
    });

    it('returns the key itself for missing key in tr lang', () => {
      expect(getMessage('totally.missing', 'tr')).toBe('totally.missing');
    });

    it('falls back to en for unknown lang code', () => {
      const result = getMessage('hint.COMPLETE', 'fr');
      // Should return English since 'fr' is not 'tr'
      expect(result).toContain('Sprint complete');
    });
  });

  describe('variable interpolation', () => {
    it('interpolates {taskCount} in status.tasks_running', () => {
      const result = getMessage('status.tasks_running', 'en', { taskCount: '5' });
      expect(result).toBe('5 tasks running');
    });

    it('interpolates {taskCount} in Turkish status.tasks_running', () => {
      const result = getMessage('status.tasks_running', 'tr', { taskCount: '3' });
      expect(result).toBe('3 görev çalışıyor');
    });

    it('interpolates {sprintId} in status.sprint_active', () => {
      const result = getMessage('status.sprint_active', 'en', { sprintId: 'sprint-042' });
      expect(result).toBe('Run sprint-042 (sprint) active');
    });

    it('interpolates {taskId} in kill.worker_killed', () => {
      const result = getMessage('kill.worker_killed', 'en', { taskId: 'task-007' });
      expect(result).toBe('Worker for task task-007 killed.');
    });

    it('interpolates {taskId} and {model} in spawn.worker_spawned tr', () => {
      const result = getMessage('spawn.worker_spawned', 'tr', {
        taskId: 'task-001',
        model: 'opus',
      });
      expect(result).toContain('task-001');
      expect(result).toContain('opus');
    });

    it('interpolates {taskId} in kill.worker_not_found tr', () => {
      const result = getMessage('kill.worker_not_found', 'tr', { taskId: 'task-999' });
      expect(result).toBe('Worker bulunamadı: task-999');
    });

    it('leaves placeholder when var is missing', () => {
      const result = getMessage('status.tasks_running', 'en', {});
      expect(result).toBe('{taskCount} tasks running');
    });

    it('leaves placeholder when vars is undefined', () => {
      const result = getMessage('status.tasks_running', 'en');
      expect(result).toBe('{taskCount} tasks running');
    });

    it('handles extra vars that do not match any placeholder', () => {
      const result = getMessage('status.no_sprint', 'en', { extra: 'ignored' });
      expect(result).toBe('No active run (sprint)');
    });
  });
});

// ─── getLanguage ──────────────────────────────────────────────────────────────

describe('getLanguage', () => {
  const origLang = process.env['LANG'];
  const origLcAll = process.env['LC_ALL'];

  beforeEach(() => {
    delete process.env['LANG'];
    delete process.env['LC_ALL'];
  });

  afterEach(() => {
    if (origLang !== undefined) {
      process.env['LANG'] = origLang;
    } else {
      delete process.env['LANG'];
    }
    if (origLcAll !== undefined) {
      process.env['LC_ALL'] = origLcAll;
    } else {
      delete process.env['LC_ALL'];
    }
  });

  it('returns "tr" when config says "tr"', () => {
    expect(getLanguage('tr')).toBe('tr');
  });

  it('returns "en" when config says "en"', () => {
    expect(getLanguage('en')).toBe('en');
  });

  it('normalizes "TR" to "tr"', () => {
    expect(getLanguage('TR')).toBe('tr');
  });

  it('normalizes "EN" to "en"', () => {
    expect(getLanguage('EN')).toBe('en');
  });

  it('falls back to "en" for unsupported config language "fr"', () => {
    expect(getLanguage('fr')).toBe('en');
  });

  it('detects Turkish from LANG env "tr_TR.UTF-8"', () => {
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage()).toBe('tr');
  });

  it('detects English from LANG env "en_US.UTF-8"', () => {
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLanguage()).toBe('en');
  });

  it('prefers LC_ALL over LANG when both set', () => {
    process.env['LANG'] = 'en_US.UTF-8';
    process.env['LC_ALL'] = 'tr_TR.UTF-8';
    expect(getLanguage()).toBe('tr');
  });

  it('falls back to "en" with no config and no env', () => {
    expect(getLanguage()).toBe('en');
  });

  it('falls back to "en" when env lang is unsupported (de_DE)', () => {
    process.env['LANG'] = 'de_DE.UTF-8';
    expect(getLanguage()).toBe('en');
  });

  it('config language takes priority over env vars', () => {
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage('en')).toBe('en');
  });

  it('returns "en" for undefined configLanguage with no env', () => {
    expect(getLanguage(undefined)).toBe('en');
  });
});

// ─── Language completeness ────────────────────────────────────────────────────

describe('Language completeness', () => {
  it('every known key has an English translation (not returning key itself)', () => {
    const missing: string[] = [];
    for (const key of KNOWN_KEYS) {
      const result = getMessage(key, 'en');
      if (result === key) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('every known key has a Turkish translation (not returning key itself)', () => {
    const missing: string[] = [];
    for (const key of KNOWN_KEYS) {
      const result = getMessage(key, 'tr');
      if (result === key) missing.push(key);
    }
    expect(missing).toEqual([]);
  });

  it('en and tr translations differ for hint keys', () => {
    const hintKeys = ['hint.COMPLETE', 'hint.EXECUTE', 'hint.PLAN', 'hint.IDLE'];
    for (const key of hintKeys) {
      const en = getMessage(key, 'en');
      const tr = getMessage(key, 'tr');
      expect(en).not.toBe(tr);
    }
  });

  it('status keys have translations in both languages', () => {
    const statusKeys = ['status.tasks_running', 'status.sprint_active', 'status.no_sprint'];
    for (const key of statusKeys) {
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(getMessage(key, 'tr')).not.toBe(key);
    }
  });

  it('kill command keys have translations in both languages', () => {
    expect(getMessage('kill.worker_killed', 'en')).toContain('killed');
    expect(getMessage('kill.worker_killed', 'tr')).toContain('durduruldu');
    expect(getMessage('kill.worker_not_found', 'en')).toContain('not found');
    expect(getMessage('kill.worker_not_found', 'tr')).toContain('bulunamadı');
  });
});

// ─── start command messages ───────────────────────────────────────────────────

describe('start command messages', () => {
  it('start.sandbox_not_implemented returns English text', () => {
    expect(getMessage('start.sandbox_not_implemented', 'en')).toContain('Sandbox');
  });

  it('start.sandbox_not_implemented returns Turkish text', () => {
    expect(getMessage('start.sandbox_not_implemented', 'tr')).toContain('Sandbox');
  });

  it('start.use_force has --force mention in both languages', () => {
    expect(getMessage('start.use_force', 'en')).toContain('--force');
    expect(getMessage('start.use_force', 'tr')).toContain('--force');
  });

  it('start.watch_ignored_dry_run mentions dry-run mode', () => {
    expect(getMessage('start.watch_ignored_dry_run', 'en')).toContain('dry-run');
    expect(getMessage('start.watch_ignored_dry_run', 'tr')).toContain('Dry-run');
  });

  it('start.sprint_planned interpolates number, id, count', () => {
    const result = getMessage('start.sprint_planned', 'en', { number: '5', id: 'sprint-005', count: '10' });
    expect(result).toContain('sprint-005');
    expect(result).toContain('10');
  });

  it('start.reasoning interpolates reasoning', () => {
    expect(getMessage('start.reasoning', 'en', { reasoning: 'test reason' })).toContain('test reason');
  });

  it('start.planning_mode interpolates mode in both languages', () => {
    expect(getMessage('start.planning_mode', 'en', { mode: 'ai' })).toContain('ai');
    expect(getMessage('start.planning_mode', 'tr', { mode: 'ai' })).toContain('ai');
  });

  it('start.workers_info interpolates count and model', () => {
    const result = getMessage('start.workers_info', 'en', { count: '4', model: 'opus' });
    expect(result).toContain('4');
    expect(result).toContain('opus');
  });

  it('start.dry_run_complete mentions Dry-run in both languages', () => {
    expect(getMessage('start.dry_run_complete', 'en')).toContain('Dry-run');
    expect(getMessage('start.dry_run_complete', 'tr')).toContain('Dry-run');
  });

  it('start.watch_window_created mentions tmux', () => {
    expect(getMessage('start.watch_window_created', 'en')).toContain('tmux');
  });

  it('start.watch_no_tmux mentions tmux in both languages', () => {
    expect(getMessage('start.watch_no_tmux', 'en')).toContain('tmux');
    expect(getMessage('start.watch_no_tmux', 'tr')).toContain('tmux');
  });
});

// ─── plan command messages ────────────────────────────────────────────────────

describe('plan command messages', () => {
  it('plan.sprint_planned interpolates number, id, count', () => {
    const result = getMessage('plan.sprint_planned', 'en', { number: '3', id: 'sprint-003', count: '7' });
    expect(result).toContain('sprint-003');
    expect(result).toContain('7');
  });

  it('plan.sprint_planned Turkish version', () => {
    const result = getMessage('plan.sprint_planned', 'tr', { number: '3', id: 'sprint-003', count: '7' });
    expect(result).toContain('sprint-003');
  });

  it('plan.reasoning interpolates reasoning', () => {
    expect(getMessage('plan.reasoning', 'en', { reasoning: 'because X' })).toContain('because X');
  });

  it('plan.planning_mode interpolates mode', () => {
    expect(getMessage('plan.planning_mode', 'en', { mode: 'structured' })).toContain('structured');
  });

  it('plan.note_sprint_size interpolates size and reason', () => {
    const result = getMessage('plan.note_sprint_size', 'en', { size: 'large', reason: 'many tasks' });
    expect(result).toContain('large');
    expect(result).toContain('many tasks');
  });

  it('plan.approved returns approval message in both langs', () => {
    expect(getMessage('plan.approved', 'en')).toContain('approved');
    expect(getMessage('plan.approved', 'tr')).toContain('onaylandı');
  });

  it('plan.rejected returns rejection message in both langs', () => {
    expect(getMessage('plan.rejected', 'en')).toContain('rejected');
    expect(getMessage('plan.rejected', 'tr')).toContain('reddedildi');
  });
});

// ─── cleanup command messages ─────────────────────────────────────────────────

describe('cleanup command messages', () => {
  it('cleanup.decay_complete interpolates before and after', () => {
    const result = getMessage('cleanup.decay_complete', 'en', { before: '100', after: '80' });
    expect(result).toContain('100');
    expect(result).toContain('80');
  });

  it('cleanup.decay_complete Turkish version', () => {
    const result = getMessage('cleanup.decay_complete', 'tr', { before: '100', after: '80' });
    expect(result).toContain('100');
    expect(result).toContain('80');
  });

  it('cleanup.archived_sprints interpolates sprints list', () => {
    const result = getMessage('cleanup.archived_sprints', 'en', { sprints: 'sprint-001, sprint-002' });
    expect(result).toContain('sprint-001');
  });

  it('cleanup.removed_items interpolates debt and patterns', () => {
    const result = getMessage('cleanup.removed_items', 'en', { debt: '3', patterns: '5' });
    expect(result).toContain('3');
    expect(result).toContain('5');
  });

  it('cleanup.complete interpolates count', () => {
    const result = getMessage('cleanup.complete', 'en', { count: '12' });
    expect(result).toContain('12');
    expect(result).toContain('Cleanup complete');
  });
});

// ─── doctor command messages ──────────────────────────────────────────────────

describe('doctor command messages', () => {
  it('doctor.checks_passed interpolates passed and total', () => {
    const result = getMessage('doctor.checks_passed', 'en', { passed: '5', total: '6' });
    expect(result).toContain('5');
    expect(result).toContain('6');
  });

  it('doctor.checks_passed Turkish version', () => {
    const result = getMessage('doctor.checks_passed', 'tr', { passed: '4', total: '5' });
    expect(result).toContain('kontrol');
  });
});

// ─── status extended messages ─────────────────────────────────────────────────

describe('status extended messages', () => {
  it('status.no_active_sprint has proper English text', () => {
    expect(getMessage('status.no_active_sprint', 'en')).toContain('No active run (sprint)');
  });

  it('status.no_active_sprint has proper Turkish text', () => {
    expect(getMessage('status.no_active_sprint', 'tr')).toContain('Aktif run (sprint) yok');
  });

  it('status.dashboard_read_failed English mentions Failed', () => {
    expect(getMessage('status.dashboard_read_failed', 'en')).toContain('Failed');
  });

  it('status.dashboard_read_failed Turkish mentions okunamadı', () => {
    expect(getMessage('status.dashboard_read_failed', 'tr')).toContain('okunamadı');
  });

  it('status.desc mentions run dashboard in both languages', () => {
    expect(getMessage('status.desc', 'en')).toContain('run dashboard');
    expect(getMessage('status.desc', 'tr')).toContain('run');
  });

  it('status.graph_no_active_run mentions run (not sprint) in both languages', () => {
    expect(getMessage('status.graph_no_active_run', 'en')).toContain('No active run');
    expect(getMessage('status.graph_no_active_run', 'tr')).toContain('Aktif run');
  });

  it('status.graph_not_found interpolates {id} and mentions run in both languages', () => {
    const en = getMessage('status.graph_not_found', 'en', { id: 'sprint-139' });
    expect(en).toContain('sprint-139');
    expect(en).toContain('run');
    const tr = getMessage('status.graph_not_found', 'tr', { id: 'sprint-139' });
    expect(tr).toContain('sprint-139');
    expect(tr).toContain('run');
  });
});

// ─── history command messages ─────────────────────────────────────────────────

describe('history command messages', () => {
  it('history.desc mentions run history in both languages', () => {
    expect(getMessage('history.desc', 'en')).toBe('Show run history');
    expect(getMessage('history.desc', 'tr')).toContain('Run geçmişi');
  });

  it('history.opt_last mentions runs in both languages', () => {
    expect(getMessage('history.opt_last', 'en')).toContain('runs');
    expect(getMessage('history.opt_last', 'tr')).toContain('run');
  });

  it('history.opt_trend mentions runs in both languages', () => {
    expect(getMessage('history.opt_trend', 'en')).toContain('runs');
    expect(getMessage('history.opt_trend', 'tr')).toContain('run');
  });

  it('history.trend_header interpolates {n} in both languages', () => {
    expect(getMessage('history.trend_header', 'en', { n: '5' })).toBe('--- Trend (last 5 runs) ---');
    expect(getMessage('history.trend_header', 'tr', { n: '5' })).toContain('5 run');
  });
});

// ─── desktop bridge messages ───────────────────────────────────────────────────

describe('desktop bridge messages', () => {
  it('desktop.shell.bridge.no_sprint mentions run (not sprint) in both languages', () => {
    expect(getMessage('desktop.shell.bridge.no_sprint', 'en')).toContain('No live run');
    expect(getMessage('desktop.shell.bridge.no_sprint', 'tr')).toContain('Canlı run yok');
  });
});

// ─── init command messages ────────────────────────────────────────────────────

describe('init command messages', () => {
  it('init.auto_detecting English mentions Auto-detecting', () => {
    expect(getMessage('init.auto_detecting', 'en')).toContain('Auto-detecting');
  });

  it('init.auto_detecting Turkish mentions algılanıyor', () => {
    expect(getMessage('init.auto_detecting', 'tr')).toContain('algılanıyor');
  });

  it('init.recommendation English mentions Recommendation', () => {
    expect(getMessage('init.recommendation', 'en')).toContain('Recommendation');
  });

  it('init.recommendation Turkish mentions Öneri', () => {
    expect(getMessage('init.recommendation', 'tr')).toContain('Öneri');
  });

  it('init.initialized interpolates name, mode, language', () => {
    const result = getMessage('init.initialized', 'en', { name: 'myproject', mode: 'max_plan', language: 'en' });
    expect(result).toContain('myproject');
    expect(result).toContain('max_plan');
  });

  it('init.next_steps returns next steps in both languages', () => {
    expect(getMessage('init.next_steps', 'en')).toContain('Next steps');
    expect(getMessage('init.next_steps', 'tr')).toContain('adımlar');
  });

  it('init.next_step_directives mentions DIRECTIVES.md in both langs', () => {
    expect(getMessage('init.next_step_directives', 'en')).toContain('DIRECTIVES.md');
    expect(getMessage('init.next_step_directives', 'tr')).toContain('DIRECTIVES.md');
  });

  it('init.next_step_start mentions deckent start in both langs', () => {
    expect(getMessage('init.next_step_start', 'en')).toContain('deckent start');
    expect(getMessage('init.next_step_start', 'tr')).toContain('deckent start');
  });
});

// ─── getLanguage empty string edge cases ─────────────────────────────────────

describe('getLanguage empty string config', () => {
  const origLang = process.env['LANG'];
  const origLcAll = process.env['LC_ALL'];

  beforeEach(() => {
    delete process.env['LANG'];
    delete process.env['LC_ALL'];
  });

  afterEach(() => {
    if (origLang !== undefined) process.env['LANG'] = origLang;
    else delete process.env['LANG'];
    if (origLcAll !== undefined) process.env['LC_ALL'] = origLcAll;
    else delete process.env['LC_ALL'];
  });

  it('empty string config falls through to LC_ALL env', () => {
    process.env['LC_ALL'] = 'tr_TR.UTF-8';
    expect(getLanguage('')).toBe('tr');
  });

  it('empty string config falls through to LANG env', () => {
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage('')).toBe('tr');
  });

  it('empty string config falls back to en with no env', () => {
    expect(getLanguage('')).toBe('en');
  });
});

// ─── Edge cases ───────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  it('getMessage with empty string key returns empty string', () => {
    expect(getMessage('', 'en')).toBe('');
  });

  it('getMessage with empty lang falls back to en behavior', () => {
    // Empty string is not 'tr', so getMessage normalizes to 'en'
    const result = getMessage('hint.COMPLETE', '');
    expect(result).toContain('Sprint complete');
  });

  it('getMessage with undefined vars arg returns raw template', () => {
    const result = getMessage('status.tasks_running', 'en', undefined);
    expect(result).toBe('{taskCount} tasks running');
  });

  it('getMessage with null-value vars keeps placeholder', () => {
    const result = getMessage('status.sprint_active', 'en', {});
    expect(result).toBe('Run {sprintId} (sprint) active');
  });

  it('getMessage for attach.no_active_session in tr', () => {
    const result = getMessage('attach.no_active_session', 'tr');
    expect(result).toContain('Aktif oturum yok');
  });

  it('variable replacement is single-pass (does not re-replace)', () => {
    // If vars contains curly-braced value, it should not be re-processed
    const result = getMessage('spawn.worker_spawned', 'en', {
      taskId: '{model}',
      model: 'opus',
    });
    // taskId is replaced with '{model}', but {model} in the result is already filled
    expect(result).toContain('{model}');
  });

  it('getMessage returns key for partially-defined key namespace', () => {
    expect(getMessage('hint', 'en')).toBe('hint');
  });

  it('getLanguage accepts config with trailing chars beyond 2 (e.g. tr_TR)', () => {
    // It slices to 2 chars: 'tr_TR'.slice(0,2) → 'tr'
    expect(getLanguage('tr_TR')).toBe('tr');
  });
});

// ─── dev-mode warn for missing keys ──────────────────────────────────────────

describe('getMessage dev-mode warn for missing keys', () => {
  const origNodeEnv = process.env['NODE_ENV'];
  let stderrSpy: ReturnType<typeof vi.spyOn<NodeJS.WriteStream, 'write'>>;

  afterEach(() => {
    stderrSpy?.mockRestore();
    if (origNodeEnv === undefined) delete process.env['NODE_ENV'];
    else process.env['NODE_ENV'] = origNodeEnv;
  });

  it('emits warn to stderr in dev mode (NODE_ENV unset) when key is missing', () => {
    delete process.env['NODE_ENV'];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = getMessage('totally.unknown.key', 'en');
    expect(result).toBe('totally.unknown.key');
    expect(stderrSpy).toHaveBeenCalledOnce();
    const written = String(stderrSpy.mock.calls[0]![0]);
    expect(written).toContain('totally.unknown.key');
    expect(written).toContain('en');
  });

  it('includes lang in the dev-mode warn message', () => {
    delete process.env['NODE_ENV'];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    getMessage('missing.key', 'tr');
    expect(stderrSpy).toHaveBeenCalledOnce();
    expect(String(stderrSpy.mock.calls[0]![0])).toContain('tr');
  });

  it('does NOT emit warn in production mode (NODE_ENV=production)', () => {
    process.env['NODE_ENV'] = 'production';
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const result = getMessage('totally.unknown.key', 'en');
    expect(result).toBe('totally.unknown.key');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('does NOT emit warn when key exists (even in dev mode)', () => {
    delete process.env['NODE_ENV'];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    getMessage('hint.COMPLETE', 'en');
    expect(stderrSpy).not.toHaveBeenCalled();
  });

  it('still returns the key string as fallback after emitting warn', () => {
    delete process.env['NODE_ENV'];
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    expect(getMessage('no.such.key', 'tr')).toBe('no.such.key');
  });
});
