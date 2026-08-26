import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ERRORS_CRITICAL_MAX_LINES,
  ERRORS_MAX_LINES,
} from '../../src/core/constants.js';
import { DeckentError, ErrorRegistry, formatHumanError } from '../../src/core/errors.js';
import { debugLog } from '../../src/core/utils.js';

const originalCwd = process.cwd();
const originalVitest = process.env['VITEST'];
const originalNodeEnv = process.env['NODE_ENV'];
let errorLogRoot: string;

beforeEach(() => {
  errorLogRoot = mkdtempSync(join(tmpdir(), 'deckent-errors-test-'));
  mkdirSync(join(errorLogRoot, '.brain'));
  process.chdir(errorLogRoot);
  delete process.env['VITEST'];
  delete process.env['NODE_ENV'];
});

afterEach(() => {
  process.chdir(originalCwd);
  if (originalVitest === undefined) delete process.env['VITEST'];
  else process.env['VITEST'] = originalVitest;
  if (originalNodeEnv === undefined) delete process.env['NODE_ENV'];
  else process.env['NODE_ENV'] = originalNodeEnv;
  rmSync(errorLogRoot, { recursive: true, force: true });
});

describe('critical error forensic channel', () => {
  it('appends a critical-class entry to both error channels', () => {
    debugLog('CONFIG_INVALID', 'configuration failed');

    expect(readFileSync(join(errorLogRoot, '.brain', 'ERRORS.md'), 'utf-8')).toContain('CONFIG_INVALID');
    expect(readFileSync(join(errorLogRoot, '.brain', 'ERRORS-critical.md'), 'utf-8')).toContain('CONFIG_INVALID');
  });

  it('appends a non-critical entry only to the general channel', () => {
    debugLog('readFileSafe', 'ordinary failure');

    expect(readFileSync(join(errorLogRoot, '.brain', 'ERRORS.md'), 'utf-8')).toContain('readFileSafe');
    expect(() => readFileSync(join(errorLogRoot, '.brain', 'ERRORS-critical.md'), 'utf-8')).toThrow();
  });

  it('trims the critical channel at its independent ceiling', () => {
    const retained = Array.from(
      { length: ERRORS_CRITICAL_MAX_LINES },
      (_, index) => `critical-${index}`,
    );
    writeFileSync(join(errorLogRoot, '.brain', 'ERRORS-critical.md'), `${retained.join('\n')}\n`);

    debugLog('WORKER_HOLD', 'latest critical event');

    const lines = readFileSync(join(errorLogRoot, '.brain', 'ERRORS-critical.md'), 'utf-8')
      .split('\n')
      .filter(Boolean);
    expect(lines).toHaveLength(ERRORS_CRITICAL_MAX_LINES);
    expect(lines[0]).toBe('critical-1');
    expect(lines.at(-1)).toContain('latest critical event');
  });

  it('preserves the existing 600-line general-channel trim contract', () => {
    const retained = Array.from(
      { length: ERRORS_MAX_LINES },
      (_, index) => `general-${index}`,
    );
    writeFileSync(join(errorLogRoot, '.brain', 'ERRORS.md'), `${retained.join('\n')}\n`);

    debugLog('ordinary-context', 'latest general event');

    const lines = readFileSync(join(errorLogRoot, '.brain', 'ERRORS.md'), 'utf-8')
      .split('\n')
      .filter(Boolean);
    expect(lines).toHaveLength(600);
    expect(lines[0]).toBe('general-1');
    expect(lines.at(-1)).toContain('latest general event');
  });
});

// ─── DeckentError class ─────────────────────────────────────────────

describe('DeckentError', () => {
  it('creates error with code and message', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found');
    expect(err.code).toBe('DECKENT_E001');
    expect(err.message).toBe('tmux not found');
    expect(err.name).toBe('DeckentError');
  });

  it('includes suggestion when provided', () => {
    const err = new DeckentError('DECKENT_E001', 'tmux not found', 'Install tmux');
    expect(err.suggestion).toBe('Install tmux');
  });

  it('includes docLink when provided', () => {
    const err = new DeckentError('DECKENT_E001', 'msg', 'sug', 'https://docs.example.com');
    expect(err.docLink).toBe('https://docs.example.com');
  });

  it('extends Error', () => {
    const err = new DeckentError('X', 'msg');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DeckentError);
  });

  it('has a stack trace', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.stack).toBeDefined();
    expect(err.stack!.length).toBeGreaterThan(0);
  });

  it('suggestion defaults to undefined', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.suggestion).toBeUndefined();
  });

  it('docLink defaults to undefined', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.docLink).toBeUndefined();
  });

  it('includes whatHappened when provided', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, 'Something broke');
    expect(err.whatHappened).toBe('Something broke');
  });

  it('includes why when provided', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, undefined, 'Because of X');
    expect(err.why).toBe('Because of X');
  });

  it('includes howToFix when provided', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, undefined, undefined, ['Step 1', 'Step 2']);
    expect(err.howToFix).toEqual(['Step 1', 'Step 2']);
  });

  it('human context fields default to undefined', () => {
    const err = new DeckentError('X', 'msg');
    expect(err.whatHappened).toBeUndefined();
    expect(err.why).toBeUndefined();
    expect(err.howToFix).toBeUndefined();
  });
});

// ─── ErrorRegistry ──────────────────────────────────────────────────

describe('ErrorRegistry', () => {
  it('has returns true for pre-populated codes', () => {
    expect(ErrorRegistry.has('DECKENT_E001')).toBe(true);
    expect(ErrorRegistry.has('DECKENT_E010')).toBe(true);
  });

  it('has returns false for unknown codes', () => {
    expect(ErrorRegistry.has('DECKENT_E999')).toBe(false);
  });

  it('get returns entry for known code', () => {
    const entry = ErrorRegistry.get('DECKENT_E001');
    expect(entry).toBeDefined();
    expect(entry!.message).toBe('tmux not found');
    expect(entry!.suggestion).toContain('tmux');
  });

  it('get returns undefined for unknown code', () => {
    expect(ErrorRegistry.get('DECKENT_E999')).toBeUndefined();
  });

  it('getAll returns all 10+ pre-populated entries', () => {
    const all = ErrorRegistry.getAll();
    expect(all.size).toBeGreaterThanOrEqual(10);
    expect(all.has('DECKENT_E001')).toBe(true);
    expect(all.has('DECKENT_E010')).toBe(true);
  });

  it('getAll returns a copy (not the internal map)', () => {
    const all = ErrorRegistry.getAll();
    all.delete('DECKENT_E001');
    expect(ErrorRegistry.has('DECKENT_E001')).toBe(true);
  });

  it('createError returns DeckentError for known code', () => {
    const err = ErrorRegistry.createError('DECKENT_E002');
    expect(err).toBeInstanceOf(DeckentError);
    expect(err.code).toBe('DECKENT_E002');
    expect(err.message).toBe('claude CLI not found');
    expect(err.suggestion).toContain('npm install');
  });

  it('createError returns DeckentError with fallback for unknown code', () => {
    const err = ErrorRegistry.createError('DECKENT_E999');
    expect(err).toBeInstanceOf(DeckentError);
    expect(err.code).toBe('DECKENT_E999');
    expect(err.message).toContain('Unknown error');
  });

  it('createError allows message override', () => {
    const err = ErrorRegistry.createError('DECKENT_E001', { message: 'custom msg' });
    expect(err.message).toBe('custom msg');
  });

  it('createError allows suggestion override', () => {
    const err = ErrorRegistry.createError('DECKENT_E001', { suggestion: 'custom sug' });
    expect(err.suggestion).toBe('custom sug');
  });

  it('register adds a new error code', () => {
    ErrorRegistry.register('DECKENT_E100', {
      message: 'test error',
      suggestion: 'test suggestion',
    });
    expect(ErrorRegistry.has('DECKENT_E100')).toBe(true);
    const entry = ErrorRegistry.get('DECKENT_E100');
    expect(entry!.message).toBe('test error');
  });

  it('pre-populated E003 has correct suggestion about DIRECTIVES', () => {
    const entry = ErrorRegistry.get('DECKENT_E003');
    expect(entry!.suggestion).toContain('DIRECTIVES');
  });

  it('pre-populated E009 is about git', () => {
    const entry = ErrorRegistry.get('DECKENT_E009');
    expect(entry!.message).toContain('git');
  });

  it('pre-populated E010 is about node version', () => {
    const entry = ErrorRegistry.get('DECKENT_E010');
    expect(entry!.message).toContain('node version');
  });

  // ─── Human Context Fields ───────────────────────────────────────

  it('all core error codes (E001-E010) have whatHappened', () => {
    for (let i = 1; i <= 10; i++) {
      const code = `DECKENT_E${String(i).padStart(3, '0')}`;
      const entry = ErrorRegistry.get(code);
      expect(entry?.whatHappened, `${code} missing whatHappened`).toBeDefined();
      expect(entry!.whatHappened!.length).toBeGreaterThan(0);
    }
  });

  it('all core error codes (E001-E010) have why', () => {
    for (let i = 1; i <= 10; i++) {
      const code = `DECKENT_E${String(i).padStart(3, '0')}`;
      const entry = ErrorRegistry.get(code);
      expect(entry?.why, `${code} missing why`).toBeDefined();
      expect(entry!.why!.length).toBeGreaterThan(0);
    }
  });

  it('all core error codes (E001-E010) have howToFix with at least 1 step', () => {
    for (let i = 1; i <= 10; i++) {
      const code = `DECKENT_E${String(i).padStart(3, '0')}`;
      const entry = ErrorRegistry.get(code);
      expect(entry?.howToFix, `${code} missing howToFix`).toBeDefined();
      expect(entry!.howToFix!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('CLI error codes (E020-E039) have human context', () => {
    for (let i = 20; i <= 39; i++) {
      const code = `DECKENT_E0${i}`;
      const entry = ErrorRegistry.get(code);
      expect(entry?.whatHappened, `${code} missing whatHappened`).toBeDefined();
      expect(entry?.why, `${code} missing why`).toBeDefined();
      expect(entry?.howToFix, `${code} missing howToFix`).toBeDefined();
    }
  });

  it('Orchestra error codes (E040-E053) have human context', () => {
    for (let i = 40; i <= 53; i++) {
      const code = `DECKENT_E0${i}`;
      const entry = ErrorRegistry.get(code);
      expect(entry?.whatHappened, `${code} missing whatHappened`).toBeDefined();
      expect(entry?.why, `${code} missing why`).toBeDefined();
      expect(entry?.howToFix, `${code} missing howToFix`).toBeDefined();
    }
  });

  it('Agent error codes (E060-E066) have human context', () => {
    for (let i = 60; i <= 66; i++) {
      const code = `DECKENT_E0${i}`;
      const entry = ErrorRegistry.get(code);
      expect(entry?.whatHappened, `${code} missing whatHappened`).toBeDefined();
      expect(entry?.why, `${code} missing why`).toBeDefined();
      expect(entry?.howToFix, `${code} missing howToFix`).toBeDefined();
    }
  });

  it('createError populates human context fields from registry', () => {
    const err = ErrorRegistry.createError('DECKENT_E003');
    expect(err.whatHappened).toContain('DIRECTIVES');
    expect(err.why).toBeDefined();
    expect(err.howToFix).toBeDefined();
    expect(err.howToFix!.length).toBeGreaterThanOrEqual(1);
  });

  it('createError for unknown code has no human context', () => {
    const err = ErrorRegistry.createError('DECKENT_E999');
    expect(err.whatHappened).toBeUndefined();
    expect(err.why).toBeUndefined();
    expect(err.howToFix).toBeUndefined();
  });
});

// ─── formatHumanError ───────────────────────────────────────────────

describe('formatHumanError', () => {
  it('includes error message and code in first line', () => {
    const err = new DeckentError('DECKENT_E003', 'no DIRECTIVES.md');
    const output = formatHumanError(err);
    expect(output).toContain('Error: no DIRECTIVES.md [DECKENT_E003]');
  });

  it('includes whatHappened section', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, 'Something went wrong');
    const output = formatHumanError(err);
    expect(output).toContain('What happened:');
    expect(output).toContain('  Something went wrong');
  });

  it('includes why section', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, undefined, 'Because of reasons');
    const output = formatHumanError(err);
    expect(output).toContain('Why:');
    expect(output).toContain('  Because of reasons');
  });

  it('includes howToFix steps with numbering', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, undefined, undefined, ['Step A', 'Step B', 'Step C']);
    const output = formatHumanError(err);
    expect(output).toContain('How to fix:');
    expect(output).toContain('  1. Step A');
    expect(output).toContain('  2. Step B');
    expect(output).toContain('  3. Step C');
  });

  it('includes docLink when present', () => {
    const err = new DeckentError('X', 'msg', undefined, 'https://docs.example.com');
    const output = formatHumanError(err);
    expect(output).toContain('Docs: https://docs.example.com');
  });

  it('omits sections when fields are missing', () => {
    const err = new DeckentError('X', 'msg');
    const output = formatHumanError(err);
    expect(output).toBe('Error: msg [X]');
    expect(output).not.toContain('What happened');
    expect(output).not.toContain('Why');
    expect(output).not.toContain('How to fix');
  });

  it('handles empty howToFix array', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, 'What', 'Why', []);
    const output = formatHumanError(err);
    expect(output).not.toContain('How to fix');
  });

  it('produces full human-friendly output for registry error', () => {
    const err = ErrorRegistry.createError('DECKENT_E003');
    const output = formatHumanError(err);
    expect(output).toContain('Error:');
    expect(output).toContain('[DECKENT_E003]');
    expect(output).toContain('What happened:');
    expect(output).toContain('Why:');
    expect(output).toContain('How to fix:');
    expect(output).toContain('1.');
  });

  it('produces complete output for E001 tmux error', () => {
    const err = ErrorRegistry.createError('DECKENT_E001');
    const output = formatHumanError(err);
    expect(output).toContain('tmux');
    expect(output).toContain('What happened:');
    expect(output).toContain('How to fix:');
  });

  it('handles single howToFix step', () => {
    const err = new DeckentError('X', 'msg', undefined, undefined, 'What', 'Why', ['Only step']);
    const output = formatHumanError(err);
    expect(output).toContain('  1. Only step');
    expect(output).not.toContain('  2.');
  });
});
