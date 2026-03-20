import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMessage, getLanguage } from '../../../src/cli/helpers/messages.js';

// Actual keys in messages.ts (104-line version)
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
      expect(getMessage('hint.IDLE', 'tr')).toContain('sprint planlayın');
    });

    it('returns English for hint.PLAN in en', () => {
      expect(getMessage('hint.PLAN', 'en')).toContain('deckent start');
    });

    it('returns English for status.no_sprint in en', () => {
      expect(getMessage('status.no_sprint', 'en')).toBe('No active sprint');
    });

    it('returns Turkish for status.no_sprint in tr', () => {
      expect(getMessage('status.no_sprint', 'tr')).toBe('Aktif sprint yok');
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
      expect(result).toBe('Sprint sprint-042 active');
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
      expect(result).toBe('No active sprint');
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
    expect(result).toBe('Sprint {sprintId} active');
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
