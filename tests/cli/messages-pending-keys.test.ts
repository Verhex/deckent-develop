/**
 * Task 352-015 (MESSAGES-KEYS) — hermetic guard for the sole-authority
 * key-addition task.
 *
 * Proves (a) the 351-001 health-snapshot debt marker (a LOCAL_MESSAGES
 * fallback map with hardcoded en/tr strings) is gone and replaced by real
 * getMessage() calls into messages.ts, (b) every key this task added is a
 * genuine en+tr pair that resolves through getMessage (not just present as
 * raw text), and (c) adding those keys did not disturb getMessage's
 * unknown-key fallback contract for pre-existing keys.
 *
 * Hermetic: reads committed source only — no gitignored state.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getMessage } from '../../src/cli/helpers/messages.js';

const HEALTH_SNAPSHOT_SOURCE = readFileSync(
  join(process.cwd(), 'src/cli/helpers/health-snapshot.ts'),
  'utf-8',
);

// The 7 keys migrated off health-snapshot.ts's former LOCAL_MESSAGES map.
const MIGRATED_HEALTH_KEYS = [
  'health.auth',
  'health.mcp',
  'health.mem',
  'health.mode',
  'health.unknown',
  'health.logged_in',
  'health.logged_out',
] as const;

describe('health-snapshot.ts: no hardcoded user-facing strings remain (test-grep)', () => {
  it('no longer defines a local LOCAL_MESSAGES fallback map', () => {
    expect(HEALTH_SNAPSHOT_SOURCE).not.toMatch(/LOCAL_MESSAGES/);
  });

  it('no longer defines a local healthMsg() helper', () => {
    expect(HEALTH_SNAPSHOT_SOURCE).not.toMatch(/function healthMsg/);
  });

  it('imports getMessage from the shared i18n module', () => {
    expect(HEALTH_SNAPSHOT_SOURCE).toMatch(/import\s+\{\s*getMessage\s*\}\s+from\s+'\.\/messages\.js'/);
  });

  it('every health.* label call site goes through getMessage(...)', () => {
    for (const key of MIGRATED_HEALTH_KEYS) {
      expect(HEALTH_SNAPSHOT_SOURCE).toMatch(new RegExp(`getMessage\\('${key.replace('.', '\\.')}',`));
    }
  });
});

describe('health.* keys: added as genuine en+tr pairs (Task 15 sole-authority addition)', () => {
  it.each(MIGRATED_HEALTH_KEYS)('%s resolves to a non-empty, non-key-echo string in en', (key) => {
    const resolved = getMessage(key, 'en');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it.each(MIGRATED_HEALTH_KEYS)('%s resolves to a non-empty, non-key-echo string in tr', (key) => {
    const resolved = getMessage(key, 'tr');
    expect(resolved).not.toBe(key);
    expect(resolved.length).toBeGreaterThan(0);
  });

  it('logged_in / logged_out / unknown differ between en and tr (genuinely localized, not copy-pasted)', () => {
    expect(getMessage('health.logged_in', 'en')).not.toBe(getMessage('health.logged_in', 'tr'));
    expect(getMessage('health.logged_out', 'en')).not.toBe(getMessage('health.logged_out', 'tr'));
    expect(getMessage('health.unknown', 'en')).not.toBe(getMessage('health.unknown', 'tr'));
    expect(getMessage('health.auth', 'en')).not.toBe(getMessage('health.auth', 'tr'));
    expect(getMessage('health.mem', 'en')).not.toBe(getMessage('health.mem', 'tr'));
    expect(getMessage('health.mode', 'en')).not.toBe(getMessage('health.mode', 'tr'));
  });

  it('preserves the exact pre-migration text (health-snapshot.test.ts substring assertions stay green)', () => {
    expect(getMessage('health.auth', 'en')).toBe('auth');
    expect(getMessage('health.auth', 'tr')).toBe('oturum');
    expect(getMessage('health.mem', 'en')).toBe('mem');
    expect(getMessage('health.mem', 'tr')).toBe('bellek');
    expect(getMessage('health.unknown', 'tr')).toBe('bilinmiyor');
  });
});

describe('getMessage fallback behavior: unaffected by the new health.* keys (no collision)', () => {
  it('a pre-existing, unrelated key still resolves exactly as before', () => {
    // Literal updated by 450-004 (RUN-RENAME dilim-3, status.no_sprint bridged to "run (sprint)"
    // wording) — the key itself is still unaffected by the health.* addition, only its text changed.
    expect(getMessage('status.no_sprint', 'en')).toBe('No active run (sprint)');
    expect(getMessage('status.no_sprint', 'tr')).toBe('Aktif run (sprint) yok');
  });

  it('a genuinely unknown key still echoes the key itself (fallback contract intact)', () => {
    const unknownKey = 'health.this_key_does_not_exist_xyz';
    expect(getMessage(unknownKey, 'en')).toBe(unknownKey);
    expect(getMessage(unknownKey, 'tr')).toBe(unknownKey);
  });

  it('an unsupported lang falls back to the en template, not a crash', () => {
    expect(getMessage('health.mode', 'fr')).toBe(getMessage('health.mode', 'en'));
  });
});
