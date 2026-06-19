import { describe, it, expect } from 'vitest';
import { showSplashIfEnabled } from '../../src/cli/helpers/splash.js';

describe('showSplashIfEnabled', () => {
  it('returns null when output_splash is false', () => {
    const result = showSplashIfEnabled({ output_splash: false }, 'x');
    expect(result).toBeNull();
  });

  it('returns splash string when output_splash is true', () => {
    const result = showSplashIfEnabled({ output_splash: true }, '1.0.0');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(result).toContain('DECKENT');
  });

  it('returns null when output_splash is undefined (falsy gate)', () => {
    const result = showSplashIfEnabled({}, 'x');
    expect(result).toBeNull();
  });
});
