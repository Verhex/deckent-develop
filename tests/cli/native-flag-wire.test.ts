// tests/cli/native-flag-wire.test.ts
import { describe, it, expect } from 'vitest';
import { isNativeAgentEnabled } from '../../src/cli/repl/native-flag.js';

describe('isNativeAgentEnabled', () => {
  it('is on when DECKENT_NATIVE_AGENT=1', () => {
    expect(isNativeAgentEnabled({ DECKENT_NATIVE_AGENT: '1' }, [])).toBe(true);
  });
  it('is on when --native is passed', () => {
    expect(isNativeAgentEnabled({}, ['--native'])).toBe(true);
  });
  it('is OFF by default (legacy path)', () => {
    expect(isNativeAgentEnabled({}, [])).toBe(false);
    expect(isNativeAgentEnabled({ DECKENT_NATIVE_AGENT: '0' }, [])).toBe(false);
  });
});
