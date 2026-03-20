import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getMessage, getLanguage } from '../../src/cli/helpers/messages.js';

describe('getMessage', () => {
  it('returns English hint for known key', () => {
    const msg = getMessage('hint.COMPLETE', 'en');
    expect(msg).toContain('Sprint complete');
    expect(msg).toContain('deckent retro');
  });

  it('returns Turkish hint for known key', () => {
    const msg = getMessage('hint.COMPLETE', 'tr');
    expect(msg).toContain('tamamlandı');
    expect(msg).toContain('deckent retro');
  });

  it('returns key itself for unknown key', () => {
    const msg = getMessage('unknown.key.xyz', 'en');
    expect(msg).toBe('unknown.key.xyz');
  });

  it('returns key for unknown key in Turkish too', () => {
    const msg = getMessage('totally.unknown', 'tr');
    expect(msg).toBe('totally.unknown');
  });

  it('interpolates variables in template', () => {
    const msg = getMessage('status.tasks_running', 'en', { taskCount: '7' });
    expect(msg).toContain('7');
    expect(msg).toContain('tasks running');
  });

  it('interpolates sprintId variable', () => {
    const msg = getMessage('status.sprint_active', 'en', { sprintId: 'sprint-022' });
    expect(msg).toContain('sprint-022');
    expect(msg).toContain('active');
  });

  it('Turkish variable interpolation works', () => {
    const msg = getMessage('status.tasks_running', 'tr', { taskCount: '3' });
    expect(msg).toContain('3');
    expect(msg).toContain('görev');
  });

  it('leaves placeholder if variable missing', () => {
    const msg = getMessage('status.sprint_active', 'en', {});
    expect(msg).toContain('{sprintId}');
  });

  it('works without vars parameter', () => {
    const msg = getMessage('hint.IDLE', 'en');
    expect(msg).toContain('deckent plan');
  });

  it('hint.EXECUTE English', () => {
    const msg = getMessage('hint.EXECUTE', 'en');
    expect(msg).toContain('deckent status --watch');
  });

  it('hint.PLAN Turkish', () => {
    const msg = getMessage('hint.PLAN', 'tr');
    expect(msg).toContain('deckent start');
    expect(msg).toContain('başlatın');
  });

  it('unknown lang falls back to English', () => {
    const msg = getMessage('hint.COMPLETE', 'de');
    expect(msg).toContain('Sprint complete');
  });
});

describe('getLanguage', () => {
  let origLang: string | undefined;
  let origLcAll: string | undefined;

  beforeEach(() => {
    origLang = process.env['LANG'];
    origLcAll = process.env['LC_ALL'];
  });

  afterEach(() => {
    if (origLang === undefined) delete process.env['LANG'];
    else process.env['LANG'] = origLang;
    if (origLcAll === undefined) delete process.env['LC_ALL'];
    else process.env['LC_ALL'] = origLcAll;
  });

  it('returns configLanguage when a supported language is provided', () => {
    expect(getLanguage('tr')).toBe('tr');
    expect(getLanguage('en')).toBe('en');
  });

  it('normalizes locale-style configLanguage (tr_TR → tr)', () => {
    expect(getLanguage('tr_TR')).toBe('tr');
  });

  it('falls back to LANG env var when configLanguage not provided', () => {
    delete process.env['LC_ALL'];
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage()).toBe('tr');
  });

  it('prefers LC_ALL over LANG env var', () => {
    process.env['LC_ALL'] = 'tr_TR.UTF-8';
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLanguage()).toBe('tr');
  });

  it('returns en when LANG is an unsupported language', () => {
    delete process.env['LC_ALL'];
    process.env['LANG'] = 'de_DE.UTF-8';
    expect(getLanguage()).toBe('en');
  });

  it('returns en when no config and no env var set', () => {
    delete process.env['LC_ALL'];
    delete process.env['LANG'];
    expect(getLanguage()).toBe('en');
  });

  it('falls back to LANG env when configLanguage is unsupported', () => {
    delete process.env['LC_ALL'];
    process.env['LANG'] = 'tr_TR.UTF-8';
    expect(getLanguage('de')).toBe('tr');
  });

  it('handles en_US LANG → returns en', () => {
    delete process.env['LC_ALL'];
    process.env['LANG'] = 'en_US.UTF-8';
    expect(getLanguage()).toBe('en');
  });
});
