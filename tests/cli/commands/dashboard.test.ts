import { describe, it, expect, afterEach } from 'vitest';
// Import via the dashboard command's own surface — it re-exports the canonical
// isNoColor from helpers/output.ts (R4-ISNOCOLOR SSOT). This both verifies the
// re-export path that existing consumers rely on and proves the collapsed
// behavior.
import { isNoColor } from '../../../src/cli/commands/dashboard.js';

// ─── R4-ISNOCOLOR faithful regression (dashboard re-export) ──────────
// The former dashboard-local isNoColor was `flagValue === true || NO_COLOR env`
// — it IGNORED `--no-color` in argv. After collapsing onto the canonical
// superset, the argv trigger is honored too. The argv-only scenario below is
// the pre-fix RED case (old impl returned false), now GREEN.

describe('dashboard isNoColor — canonical superset (re-exported)', () => {
  const originalEnv = process.env.NO_COLOR;
  const originalArgv = [...process.argv];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = originalEnv;
    process.argv = [...originalArgv];
  });

  it('returns false when no trigger is active', () => {
    delete process.env.NO_COLOR;
    process.argv = ['node', 'deckent', 'dashboard'];
    expect(isNoColor()).toBe(false);
    expect(isNoColor(false)).toBe(false);
  });

  it('trigger 1 — flagValue === true (preserved dashboard behavior)', () => {
    delete process.env.NO_COLOR;
    process.argv = ['node', 'deckent', 'dashboard'];
    expect(isNoColor(true)).toBe(true);
  });

  it('trigger 2 — NO_COLOR env set (preserved dashboard behavior)', () => {
    process.env.NO_COLOR = '1';
    process.argv = ['node', 'deckent', 'dashboard'];
    expect(isNoColor()).toBe(true);
  });

  it('trigger 3 — --no-color in argv (was RED pre-fix: old impl ignored argv)', () => {
    delete process.env.NO_COLOR;
    process.argv = ['node', 'deckent', 'dashboard', '--no-color'];
    expect(isNoColor()).toBe(true);
  });
});
