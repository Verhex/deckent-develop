import { describe, it, expect } from 'vitest';
import { getMessage } from '../../src/cli/helpers/messages.js';

// ─── Error keys that must exist ─────────────────────────────────────

const ERROR_KEYS = [
  'error.tmux_not_found',
  'error.claude_not_found',
  'error.no_directives',
  'error.config_invalid',
  'error.scope_violation',
  'error.lock_conflict',
  'error.usage_exceeded',
  'error.build_failed',
  'error.git_not_found',
  'error.node_version_low',
];

// ─── getMessage support ─────────────────────────────────────────────

describe('i18n error messages — getMessage', () => {
  for (const key of ERROR_KEYS) {
    it(`getMessage returns English message for "${key}"`, () => {
      const msg = getMessage(key, 'en');
      expect(msg).not.toBe(key); // not just the key echoed back
      expect(msg.length).toBeGreaterThan(5);
    });
  }

  for (const key of ERROR_KEYS) {
    it(`getMessage returns Turkish message for "${key}"`, () => {
      const msg = getMessage(key, 'tr');
      expect(msg).not.toBe(key);
      expect(msg.length).toBeGreaterThan(5);
    });
  }
});

// ─── i18n JSON files ────────────────────────────────────────────────

describe('i18n error messages — JSON files', () => {
  for (const key of ERROR_KEYS) {
    it(`English catalog has key "${key}"`, () => {
      expect(getMessage(key, 'en')).not.toBe(key);
      expect(typeof getMessage(key, 'en')).toBe('string');
    });
  }

  for (const key of ERROR_KEYS) {
    it(`Turkish catalog has key "${key}"`, () => {
      expect(getMessage(key, 'tr')).not.toBe(key);
      expect(typeof getMessage(key, 'tr')).toBe('string');
    });
  }

  it('en.json and tr.json have different values for error.tmux_not_found', () => {
    expect(getMessage('error.tmux_not_found', 'en')).not.toBe(
      getMessage('error.tmux_not_found', 'tr'),
    );
  });

  it('en.json error messages contain actionable info', () => {
    // tmux message should mention install
    expect(getMessage('error.tmux_not_found', 'en')).toContain('Install');
    // claude message should mention npm
    expect(getMessage('error.claude_not_found', 'en')).toContain('npm');
    // git message should mention install
    expect(getMessage('error.git_not_found', 'en')).toContain('git');
  });
});
