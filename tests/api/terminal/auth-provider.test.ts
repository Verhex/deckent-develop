import { describe, it, expect, afterEach } from 'vitest';
import { LocalTokenAuthProvider } from '../../../src/api/terminal/auth-provider.js';

describe('LocalTokenAuthProvider', () => {
  afterEach(() => {
    delete process.env['DECKENT_API_AUTH_DISABLED'];
  });

  it('accepts the correct token', () => {
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify('secret-abc')).toBe(true);
  });

  it('rejects a wrong token', () => {
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify('nope')).toBe(false);
  });

  it('rejects empty/undefined', () => {
    const p = new LocalTokenAuthProvider('secret-abc');
    expect(p.verify(undefined)).toBe(false);
    expect(p.verify('')).toBe(false);
  });

  it('is independent of DECKENT_API_AUTH_DISABLED', () => {
    process.env['DECKENT_API_AUTH_DISABLED'] = '1';
    const p = new LocalTokenAuthProvider('secret-abc');
    // The global API auth bypass MUST NOT open a shell — spec §1c.2.
    expect(p.verify('wrong')).toBe(false);
    expect(p.verify(undefined)).toBe(false);
    expect(p.verify('')).toBe(false);
    // Correct token still works regardless of the bypass flag.
    expect(p.verify('secret-abc')).toBe(true);
  });
});
