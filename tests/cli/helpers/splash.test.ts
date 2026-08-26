import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { KRAKEN_ASCII, showSplash, showSplashIfEnabled } from '../../../src/cli/helpers/splash.js';
import { showSplashIfEnabled as showSplashIfEnabled__tsm_011 } from "../../../src/cli/helpers/splash.js";

describe('splash', () => {
  const savedNoColor = process.env.NO_COLOR;

  beforeEach(() => {
    delete process.env.NO_COLOR;
  });

  afterEach(() => {
    if (savedNoColor !== undefined) {
      process.env.NO_COLOR = savedNoColor;
    } else {
      delete process.env.NO_COLOR;
    }
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

    it('includes ANSI codes when NO_COLOR is not set', () => {
      const result = showSplash('1.0.0');
      expect(result).toContain('\x1b[');
    });

    it('produces clean text when NO_COLOR is set', () => {
      process.env.NO_COLOR = '1';
      const result = showSplash('1.0.0');
      expect(result).not.toContain('\x1b');
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
