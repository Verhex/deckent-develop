// B14 task 2 (born 3322): the doctor and the xverify composition may never
// again disagree about the provider-limit-authority state. The check reads the
// SAME global-layer surface the composition reads and distinguishes the three
// states the born row names; the remedy text points at the authoring flow and
// explicitly NOT at `keyring init` (the misdirection the row was born from).

import { describe, it, expect } from 'vitest';
import { buildProviderLimitAuthorityCheck } from '../../src/cli/commands/doctor.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

describe('doctor provider-limit-authority coverage (born 3322)', () => {
  it('absent → failed required check whose remedy names the authoring flow, not keyring init', () => {
    const check = buildProviderLimitAuthorityCheck('en', () => ({ state: 'absent' }));
    expect(check.passed).toBe(false);
    expect(check.required).toBe(true);
    expect(check.message).toContain('provider-authority limits init');
    expect(check.message).toContain('never `keyring init`');
  });

  it('authored-empty is distinguished from absent — its own message, still failed', () => {
    const check = buildProviderLimitAuthorityCheck('en', () => ({ state: 'authored-empty' }));
    expect(check.passed).toBe(false);
    expect(check.message).toContain('authored-empty');
    expect(check.message).not.toContain('No owner-authored');
  });

  it('present → passes with the policy count visible', () => {
    const check = buildProviderLimitAuthorityCheck('en', () => ({ state: 'present', policies: 2 }));
    expect(check.passed).toBe(true);
    expect(check.message).toContain('2');
  });

  it('remedy strings live in the message authority with both languages distinct', () => {
    for (const key of [
      'doctor.provider_limit_authority_absent',
      'doctor.provider_limit_authority_authored_empty',
      'doctor.provider_limit_authority_ok',
    ]) {
      const en = getMessage(key, 'en', { policies: '1' });
      const tr = getMessage(key, 'tr', { policies: '1' });
      expect(en).not.toBe(key);
      expect(tr).not.toBe(key);
      expect(en).not.toBe(tr);
    }
  });

  it('the keyring remedy no longer claims to fix the limit-authority hold', () => {
    const keyringAbsent = getMessage('doctor.provider_authority_keyring_absent', 'en');
    expect(keyringAbsent).not.toMatch(/xverify|limit.authority|provider_limits/i);
  });
});
