import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Theme, theme } from '../../../src/cli/helpers/theme.js';

// ─── Helpers ────────────────────────────────────────────────────────

let origNoColor: string | undefined;
let origForceColor: string | undefined;
let origIsTTY: boolean | undefined;

function saveEnv(): void {
  origNoColor = process.env['NO_COLOR'];
  origForceColor = process.env['FORCE_COLOR'];
  origIsTTY = process.stdout.isTTY;
}

function restoreEnv(): void {
  if (origNoColor === undefined) {
    delete process.env['NO_COLOR'];
  } else {
    process.env['NO_COLOR'] = origNoColor;
  }
  if (origForceColor === undefined) {
    delete process.env['FORCE_COLOR'];
  } else {
    process.env['FORCE_COLOR'] = origForceColor;
  }
  Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
}

// ─── Theme tests ────────────────────────────────────────────────────

describe('Theme', () => {
  beforeEach(() => {
    saveEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('is a class that can be instantiated', () => {
    const t = new Theme();
    expect(t).toBeInstanceOf(Theme);
  });

  it('singleton theme instance exists', () => {
    expect(theme).toBeInstanceOf(Theme);
  });

  // ─── Color output with FORCE_COLOR ──────────────────────────────

  describe('with color enabled (FORCE_COLOR=1)', () => {
    beforeEach(() => {
      process.env['FORCE_COLOR'] = '1';
      delete process.env['NO_COLOR'];
    });

    it('success wraps text in green ANSI', () => {
      const t = new Theme();
      const result = t.success('OK');
      expect(result).toBe('\x1b[32mOK\x1b[0m');
    });

    it('error wraps text in red ANSI', () => {
      const t = new Theme();
      const result = t.error('FAIL');
      expect(result).toBe('\x1b[31mFAIL\x1b[0m');
    });

    it('warning wraps text in yellow ANSI', () => {
      const t = new Theme();
      const result = t.warning('WARN');
      expect(result).toBe('\x1b[33mWARN\x1b[0m');
    });

    it('info wraps text in blue ANSI', () => {
      const t = new Theme();
      const result = t.info('INFO');
      expect(result).toBe('\x1b[34mINFO\x1b[0m');
    });

    it('muted wraps text in dim ANSI', () => {
      const t = new Theme();
      const result = t.muted('dim');
      expect(result).toBe('\x1b[2mdim\x1b[0m');
    });

    it('accent wraps text in cyan ANSI', () => {
      const t = new Theme();
      const result = t.accent('link');
      expect(result).toBe('\x1b[36mlink\x1b[0m');
    });

    it('bold wraps text in bold ANSI', () => {
      const t = new Theme();
      const result = t.bold('BOLD');
      expect(result).toBe('\x1b[1mBOLD\x1b[0m');
    });
  });

  // ─── NO_COLOR environment ─────────────────────────────────────────

  describe('with NO_COLOR set', () => {
    beforeEach(() => {
      process.env['NO_COLOR'] = '1';
      delete process.env['FORCE_COLOR'];
    });

    it('success returns plain text', () => {
      const t = new Theme();
      expect(t.success('OK')).toBe('OK');
    });

    it('error returns plain text', () => {
      const t = new Theme();
      expect(t.error('FAIL')).toBe('FAIL');
    });

    it('warning returns plain text', () => {
      const t = new Theme();
      expect(t.warning('WARN')).toBe('WARN');
    });
  });

  // ─── FORCE_COLOR=0 ───────────────────────────────────────────────

  describe('with FORCE_COLOR=0', () => {
    beforeEach(() => {
      process.env['FORCE_COLOR'] = '0';
      delete process.env['NO_COLOR'];
    });

    it('success returns plain text', () => {
      const t = new Theme();
      expect(t.success('OK')).toBe('OK');
    });
  });

  // ─── FORCE_COLOR overrides NO_COLOR ───────────────────────────────

  describe('FORCE_COLOR=1 overrides NO_COLOR', () => {
    beforeEach(() => {
      process.env['FORCE_COLOR'] = '1';
      process.env['NO_COLOR'] = '1';
    });

    it('success returns colored text', () => {
      const t = new Theme();
      const result = t.success('OK');
      expect(result).toContain('\x1b[');
    });
  });

  // ─── strip ─────────────────────────────────────────────────────────

  describe('strip', () => {
    it('removes ANSI escape codes', () => {
      const t = new Theme();
      expect(t.strip('\x1b[32mOK\x1b[0m')).toBe('OK');
    });

    it('returns plain text unchanged', () => {
      const t = new Theme();
      expect(t.strip('plain')).toBe('plain');
    });

    it('handles multiple ANSI codes', () => {
      const t = new Theme();
      expect(t.strip('\x1b[1m\x1b[32mBOLD GREEN\x1b[0m')).toBe('BOLD GREEN');
    });
  });
});
