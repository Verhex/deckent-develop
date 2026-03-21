import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
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
  const root = join(__dirname, '..', '..');
  let enData: Record<string, string>;
  let trData: Record<string, string>;

  try {
    enData = JSON.parse(readFileSync(join(root, '.deckent', 'i18n', 'en.json'), 'utf-8'));
    trData = JSON.parse(readFileSync(join(root, '.deckent', 'i18n', 'tr.json'), 'utf-8'));
  } catch {
    enData = {};
    trData = {};
  }

  for (const key of ERROR_KEYS) {
    it(`en.json has key "${key}"`, () => {
      expect(enData[key]).toBeDefined();
      expect(typeof enData[key]).toBe('string');
    });
  }

  for (const key of ERROR_KEYS) {
    it(`tr.json has key "${key}"`, () => {
      expect(trData[key]).toBeDefined();
      expect(typeof trData[key]).toBe('string');
    });
  }

  it('en.json and tr.json have different values for error.tmux_not_found', () => {
    expect(enData['error.tmux_not_found']).not.toBe(trData['error.tmux_not_found']);
  });

  it('en.json error messages contain actionable info', () => {
    // tmux message should mention install
    expect(enData['error.tmux_not_found']).toContain('Install');
    // claude message should mention npm
    expect(enData['error.claude_not_found']).toContain('npm');
    // git message should mention install
    expect(enData['error.git_not_found']).toContain('git');
  });
});
