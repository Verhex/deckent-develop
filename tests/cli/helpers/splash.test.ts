import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  KRAKEN_ASCII,
  KRAKEN_PRINTABLE_ASCII,
  resolveKrakenArt,
  showSplash,
  showSplashIfEnabled,
} from '../../../src/cli/helpers/splash.js';
import { showSplashIfEnabled as showSplashIfEnabled__tsm_011 } from '../../../src/cli/helpers/splash.js';

const PRINTABLE_ASCII_RE = /^[\x20-\x7E\r\n]*$/;

function saveEnv(keys: string[]): Record<string, string | undefined> {
  const saved: Record<string, string | undefined> = {};
  for (const key of keys) saved[key] = process.env[key];
  return saved;
}

function restoreEnv(saved: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(saved)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}

describe('splash', () => {
  const envKeys = ['NO_COLOR', 'FORCE_COLOR', 'TERM', 'DECKENT_ASCII', 'LC_ALL', 'LC_CTYPE', 'LANG', 'COLORTERM', 'COLORFGBG'];
  let savedEnv: Record<string, string | undefined>;

  beforeEach(() => {
    savedEnv = saveEnv(envKeys);
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
    delete process.env.DECKENT_ASCII;
    delete process.env.LC_ALL;
    delete process.env.LC_CTYPE;
    delete process.env.LANG;
    delete process.env.COLORFGBG;
    process.env.TERM = 'xterm-256color';
  });

  afterEach(() => {
    restoreEnv(savedEnv);
  });

  describe('KRAKEN_ASCII', () => {
    it('contains dome shape characters', () => {
      expect(KRAKEN_ASCII).toContain('▄████▄');
    });

    it('contains tentacle characters', () => {
      expect(KRAKEN_ASCII).toContain('▐▌');
    });

    it('contains base characters', () => {
      expect(KRAKEN_ASCII).toContain('▀');
    });
  });

  describe('KRAKEN_PRINTABLE_ASCII', () => {
    it('uses only printable ASCII', () => {
      expect(KRAKEN_PRINTABLE_ASCII).toMatch(PRINTABLE_ASCII_RE);
    });

    it('preserves kraken silhouette markers', () => {
      expect(KRAKEN_PRINTABLE_ASCII).toContain('.----.');
      expect(KRAKEN_PRINTABLE_ASCII).toContain('/######\\');
    });
  });

  describe('resolveKrakenArt', () => {
    it('returns Unicode art by default', () => {
      expect(resolveKrakenArt({ TERM: 'xterm-256color' })).toBe(KRAKEN_ASCII);
    });

    it('returns printable art when ASCII is required', () => {
      expect(resolveKrakenArt({ TERM: 'dumb' })).toBe(KRAKEN_PRINTABLE_ASCII);
    });

    it('only permits an explicit override toward safer ASCII', () => {
      expect(resolveKrakenArt({ TERM: 'xterm-256color' }, true)).toBe(KRAKEN_PRINTABLE_ASCII);
      expect(resolveKrakenArt({ TERM: 'dumb' }, false)).toBe(KRAKEN_PRINTABLE_ASCII);
      expect(resolveKrakenArt({ TERM: 'xterm', LANG: 'C' }, false)).toBe(KRAKEN_PRINTABLE_ASCII);
      expect(resolveKrakenArt({ TERM: 'xterm', LANG: 'en_US.UTF-8' }, false)).toBe(KRAKEN_ASCII);
    });
  });

  describe('showSplash', () => {
    it('includes DECKENT text', () => {
      const result = showSplash('1.0.0');
      expect(result).toContain('DECKENT');
    });

    it('includes version string', () => {
      const result = showSplash('0.2.0-beta.1');
      expect(result).toContain('v0.2.0-beta.1');
    });

    it('includes tagline', () => {
      const result = showSplash('1.0.0');
      expect(result).toContain('AI Agent Orchestrator');
    });

    it('includes Unicode kraken by default', () => {
      const result = showSplash('1.0.0');
      expect(result).toContain('▄████▄');
      expect(result).not.toContain('.----.');
    });

    it('includes printable kraken when ascii option is set', () => {
      const result = showSplash('1.0.0', { ascii: true });
      expect(result).toContain('.----.');
      expect(result).not.toContain('▄████▄');
      expect(result.replace(/\x1b\[[0-9;]*m/g, '')).toMatch(PRINTABLE_ASCII_RE);
    });

    it('includes ANSI codes when NO_COLOR is not set', () => {
      const result = showSplash('1.0.0');
      expect(result).toContain('\x1b[');
    });

    it('produces clean text when NO_COLOR is set to 1', () => {
      process.env.NO_COLOR = '1';
      const result = showSplash('1.0.0');
      expect(result).not.toContain('\x1b');
      expect(result).toContain('▄████▄');
    });

    it('produces clean text when NO_COLOR is empty', () => {
      process.env.NO_COLOR = '';
      const result = showSplash('1.0.0');
      expect(result).not.toContain('\x1b');
    });

    it('keeps Unicode glyphs under NO_COLOR while stripping ANSI', () => {
      process.env.NO_COLOR = '1';
      const result = showSplash('1.0.0');
      expect(result).toContain('▐▌');
    });

    it('uses printable art under dumb terminal even with color', () => {
      process.env.TERM = 'dumb';
      process.env.FORCE_COLOR = '3';
      const result = showSplash('1.0.0');
      expect(result).toContain('.----.');
      expect(result).not.toContain('▄████▄');
    });

    it('degrades color tier with truecolor capability', () => {
      process.env.COLORTERM = 'truecolor';
      process.env.COLORFGBG = '15;0';
      const result = showSplash('1.0.0');
      expect(result).toContain('\x1b[38;2;77;184;164m');
    });

    it('uses 16-color tier when truecolor capability lacks dark background', () => {
      delete process.env.COLORFGBG;
      process.env.COLORTERM = 'truecolor';
      const result = showSplash('1.0.0');
      expect(result).toContain('\x1b[36m');
      expect(result).not.toContain('\x1b[38;2;');
    });

    it('suppresses color when FORCE_COLOR=0', () => {
      process.env.FORCE_COLOR = '0';
      const result = showSplash('1.0.0');
      expect(result).not.toContain('\x1b[');
    });

    it('enables color when FORCE_COLOR is positive even without TTY semantics', () => {
      process.env.FORCE_COLOR = '3';
      process.env.COLORTERM = 'truecolor';
      process.env.COLORFGBG = '15;0';
      const result = showSplash('1.0.0');
      expect(result).toContain('\x1b[');
    });

    it('lets positive FORCE_COLOR override NO_COLOR per theme gate', () => {
      process.env.FORCE_COLOR = '3';
      process.env.NO_COLOR = '1';
      const result = showSplash('1.0.0');
      expect(result).toContain('\x1b[');
      expect(result).toContain('▄████▄');
    });

    it('suppresses color when NO_COLOR is set without FORCE_COLOR', () => {
      delete process.env.FORCE_COLOR;
      process.env.NO_COLOR = '';
      const result = showSplash('1.0.0');
      expect(result).not.toContain('\x1b[');
    });

    it('respects --no-color argv ahead of FORCE_COLOR', () => {
      const savedArgv = [...process.argv];
      process.argv = [...savedArgv, '--no-color'];
      process.env.FORCE_COLOR = '3';
      try {
        const result = showSplash('1.0.0');
        expect(result).not.toContain('\x1b[');
      } finally {
        process.argv = savedArgv;
      }
    });
  });

  describe('showSplashIfEnabled', () => {
    it('returns null when output_splash is false', () => {
      const result = showSplashIfEnabled({ output_splash: false }, '1.0.0');
      expect(result).toBeNull();
    });

    it('returns splash when output_splash is true', () => {
      const result = showSplashIfEnabled({ output_splash: true }, '1.0.0');
      expect(result).not.toBeNull();
      expect(result).toContain('DECKENT');
    });

    it('returns null when output_splash is undefined', () => {
      const result = showSplashIfEnabled({}, '1.0.0');
      expect(result).toBeNull();
    });

    it('forwards ascii option to showSplash', () => {
      const result = showSplashIfEnabled({ output_splash: true }, '1.0.0', { ascii: true });
      expect(result).toContain('.----.');
    });
  });
});

// TSM-011: physically merged from tests/cli/splash.test.ts.
{
describe('showSplashIfEnabled', () => {
    it('returns null when output_splash is false', () => {
        const result = showSplashIfEnabled__tsm_011({ output_splash: false }, 'x');
        expect(result).toBeNull();
    });
    it('returns splash string when output_splash is true', () => {
        const result = showSplashIfEnabled__tsm_011({ output_splash: true }, '1.0.0');
        expect(result).not.toBeNull();
        expect(typeof result).toBe('string');
        expect(result).toContain('DECKENT');
    });
    it('returns null when output_splash is undefined (falsy gate)', () => {
        const result = showSplashIfEnabled__tsm_011({}, 'x');
        expect(result).toBeNull();
    });
});
}
