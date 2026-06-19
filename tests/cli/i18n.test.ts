/**
 * tests/cli/i18n.test.ts — i18n infrastructure tests (12+ tests).
 *
 * Covers:
 *  - detectLang() with config, LANG env, LC_ALL env, fallback
 *  - getMessages() convenience wrapper
 *  - TR/EN parity for all 5 target commands
 *  - LANG=tr_TR.UTF-8 locale string normalization
 *  - help.ts formatHelp() localized output
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { detectLang, getMessages, getMessage, getLanguage, isSupportedLang, SUPPORTED_LANGS } from '../../src/cli/helpers/i18n.js';
import { formatHelp, HELP_CONTENT } from '../../src/cli/commands/help.js';

// ─── Helpers ────────────────────────────────────────────────────────

function makeTmpRoot(config?: { language?: string }): string {
  const dir = join(tmpdir(), `deckent-i18n-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, '.deckent'), { recursive: true });
  if (config !== undefined) {
    writeFileSync(join(dir, '.deckent', 'config.json'), JSON.stringify(config));
  }
  return dir;
}

function cleanup(dir: string): void {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ }
}

// ─── detectLang() ──────────────────────────────────────────────────

describe('detectLang()', () => {
  let tmpRoot: string;
  const origLang = process.env['LANG'];
  const origLcAll = process.env['LC_ALL'];

  beforeEach(() => {
    delete process.env['LANG'];
    delete process.env['LC_ALL'];
    tmpRoot = '';
  });

  afterEach(() => {
    if (origLang !== undefined) process.env['LANG'] = origLang;
    else delete process.env['LANG'];
    if (origLcAll !== undefined) process.env['LC_ALL'] = origLcAll;
    else delete process.env['LC_ALL'];
    if (tmpRoot) cleanup(tmpRoot);
  });

  it('returns "en" when no config and no env vars', () => {
    tmpRoot = makeTmpRoot();
    expect(detectLang(tmpRoot)).toBe('en');
  });

  it('returns "tr" when config.language is "tr"', () => {
    tmpRoot = makeTmpRoot({ language: 'tr' });
    expect(detectLang(tmpRoot)).toBe('tr');
  });

  it('returns "en" when config.language is "en"', () => {
    tmpRoot = makeTmpRoot({ language: 'en' });
    expect(detectLang(tmpRoot)).toBe('en');
  });

  it('detects Turkish from LANG=tr_TR.UTF-8', () => {
    tmpRoot = makeTmpRoot(); // no config language
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(detectLang(tmpRoot)).toBe('tr');
  });

  it('detects Turkish from LC_ALL=tr_TR.UTF-8 (higher priority than LANG)', () => {
    tmpRoot = makeTmpRoot();
    process.env['LC_ALL'] = 'tr_TR.UTF-8';
    process.env['LANG'] = 'en_US.UTF-8';
    expect(detectLang(tmpRoot)).toBe('tr');
  });

  it('config language takes priority over LANG env var', () => {
    tmpRoot = makeTmpRoot({ language: 'en' });
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(detectLang(tmpRoot)).toBe('en');
  });

  it('falls back to LANG env when no config directory exists', () => {
    process.env['LANG'] = 'tr_TR.UTF-8';
    // Use a non-existent root
    expect(detectLang('/nonexistent/path')).toBe('tr');
  });

  it('returns "en" for unsupported LANG value', () => {
    tmpRoot = makeTmpRoot();
    process.env['LANG'] = 'ja_JP.UTF-8';
    expect(detectLang(tmpRoot)).toBe('en');
  });
});

// ─── getMessages() ─────────────────────────────────────────────────

describe('getMessages()', () => {
  it('returns English messages for lang="en"', () => {
    const t = getMessages('en');
    const msg = t('hint.COMPLETE');
    expect(msg).toContain('Sprint complete');
  });

  it('returns Turkish messages for lang="tr"', () => {
    const t = getMessages('tr');
    const msg = t('hint.COMPLETE');
    expect(msg).toContain('tamamlandı');
  });

  it('supports variable interpolation', () => {
    const t = getMessages('en');
    const msg = t('status.tasks_running', { taskCount: '5' });
    expect(msg).toContain('5');
    expect(msg).toContain('tasks running');
  });

  it('Turkish variable interpolation works', () => {
    const t = getMessages('tr');
    const msg = t('status.tasks_running', { taskCount: '3' });
    expect(msg).toContain('3');
    expect(msg).toContain('görev');
  });

  it('falls back to English for unsupported lang', () => {
    const t = getMessages('ja');
    const msg = t('hint.COMPLETE');
    // Should return English fallback
    expect(msg).toContain('Sprint complete');
  });
});

// ─── getLanguage() ─────────────────────────────────────────────────

describe('getLanguage()', () => {
  const origLang = process.env['LANG'];

  afterEach(() => {
    if (origLang !== undefined) process.env['LANG'] = origLang;
    else delete process.env['LANG'];
  });

  it('normalizes tr_TR.UTF-8 to "tr"', () => {
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage()).toBe('tr');
  });

  it('returns "en" for en_US.UTF-8', () => {
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLanguage()).toBe('en');
  });

  it('accepts explicit configLanguage override', () => {
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage('en')).toBe('en');
  });
});

// ─── TR/EN Parity for 5 commands ───────────────────────────────────

describe('TR/EN parity — 5 command messages', () => {
  const commandKeys = [
    // init
    'init.select_plan',
    'init.enter_project_name',
    'init.initialized',
    'init.next_steps',
    // start
    'start.sprint_planned',
    'start.dry_run_complete',
    'start.use_force',
    'start.zero_config_created',
    // status
    'status.no_active_sprint',
    'status.dashboard_read_failed',
    // doctor
    'doctor.checks_passed',
    // help — via HELP_CONTENT directly
  ] as const;

  for (const key of commandKeys) {
    it(`key "${key}" has both EN and TR translations`, () => {
      const en = getMessage(key, 'en');
      const tr = getMessage(key, 'tr');
      // Neither should return the raw key (which signals missing translation)
      expect(en).not.toBe(key);
      expect(tr).not.toBe(key);
      // EN and TR must differ (actual translations)
      expect(en).not.toBe(tr);
    });
  }
});

// ─── help.ts formatHelp() ──────────────────────────────────────────

describe('formatHelp()', () => {
  it('returns English content for lang="en"', () => {
    const output = formatHelp('en');
    expect(output).toContain(HELP_CONTENT.en.title);
    expect(output).toContain('deckent init');
    expect(output).toContain('Initialize a new Deckent project');
  });

  it('returns Turkish content for lang="tr"', () => {
    const output = formatHelp('tr');
    expect(output).toContain(HELP_CONTENT.tr.title);
    expect(output).toContain('deckent init');
    expect(output).toContain('Yeni bir Deckent projesi başlat');
  });

  it('EN and TR outputs are different', () => {
    expect(formatHelp('en')).not.toBe(formatHelp('tr'));
  });

  it('surfaces the operations/monitoring commands (watch --follow, resources) in EN and TR', () => {
    for (const lang of ['en', 'tr'] as const) {
      const output = formatHelp(lang);
      // docker-worker live monitor must be discoverable from the quick-reference
      expect(output).toContain('deckent watch --follow');
      expect(output).toContain('deckent resources');
    }
  });

  it('contains all sections in English output', () => {
    const output = formatHelp('en');
    for (const section of HELP_CONTENT.en.sections) {
      expect(output).toContain(section.heading);
    }
  });

  it('contains all 3 sections in Turkish output', () => {
    const output = formatHelp('tr');
    for (const section of HELP_CONTENT.tr.sections) {
      expect(output).toContain(section.heading);
    }
  });
});

// ─── isSupportedLang() / SUPPORTED_LANGS ───────────────────────────

describe('isSupportedLang()', () => {
  it('returns true for "en"', () => {
    expect(isSupportedLang('en')).toBe(true);
  });

  it('returns true for "tr"', () => {
    expect(isSupportedLang('tr')).toBe(true);
  });

  it('returns false for unsupported codes', () => {
    expect(isSupportedLang('ja')).toBe(false);
    expect(isSupportedLang('de')).toBe(false);
    expect(isSupportedLang('')).toBe(false);
  });

  it('SUPPORTED_LANGS contains en and tr', () => {
    expect(SUPPORTED_LANGS).toContain('en');
    expect(SUPPORTED_LANGS).toContain('tr');
  });
});
