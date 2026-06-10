// tests/core/config-interrogate.test.ts
//
// Hermetic tests for plan.interrogate config + i18n interrogation keys.
// No gitignored state read; no spawnSync; runs on fresh checkout.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateConfig, ConfigValidationError } from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/config-types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function minimalConfig(overrides: Partial<DeckentConfig> = {}): DeckentConfig {
  return {
    mode: 'balanced',
    modes: {},
    ...overrides,
  } as DeckentConfig;
}

/** Collect validation errors without throwing — filters out unrelated mode errors. */
function collectPlanErrors(config: DeckentConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (err: unknown) {
    if (err instanceof ConfigValidationError) {
      return err.errors.filter(e => e.includes('plan.interrogate'));
    }
    throw err;
  }
}

// ─── Config validation tests ─────────────────────────────────────────────────

describe('plan.interrogate config', () => {
  it('accepts plan.interrogate = true without plan.interrogate errors', () => {
    const planErrors = collectPlanErrors(minimalConfig({ plan: { interrogate: true } }));
    expect(planErrors).toHaveLength(0);
  });

  it('accepts plan.interrogate = false without plan.interrogate errors', () => {
    const planErrors = collectPlanErrors(minimalConfig({ plan: { interrogate: false } }));
    expect(planErrors).toHaveLength(0);
  });

  it('produces no plan.interrogate errors when plan block is absent (default off)', () => {
    const planErrors = collectPlanErrors(minimalConfig());
    expect(planErrors).toHaveLength(0);
  });

  it('returns error when plan.interrogate is a non-boolean string', () => {
    const planErrors = collectPlanErrors(
      minimalConfig({ plan: { interrogate: 'yes' as unknown as boolean } }),
    );
    expect(planErrors.length).toBeGreaterThan(0);
    expect(planErrors[0]).toMatch(/plan\.interrogate/);
  });

  it('returns error when plan.interrogate is a number', () => {
    const planErrors = collectPlanErrors(
      minimalConfig({ plan: { interrogate: 1 as unknown as boolean } }),
    );
    expect(planErrors.length).toBeGreaterThan(0);
    expect(planErrors[0]).toMatch(/plan\.interrogate/);
  });
});

// ─── i18n key presence tests ─────────────────────────────────────────────────

const INTERROGATE_KEYS = [
  'interrogate.intro',
  'interrogate.draft_header',
  'interrogate.q_pain',
  'interrogate.q_wedge',
  'interrogate.q_hidden',
  'interrogate.q_premise',
  'interrogate.q_effort',
] as const;

describe('interrogate i18n keys in messages.ts', () => {
  let source: string;

  // Read the committed source once (hermetic — no gitignored state)
  try {
    source = readFileSync(join(process.cwd(), 'src/cli/helpers/messages.ts'), 'utf-8');
  } catch {
    source = '';
  }

  for (const key of INTERROGATE_KEYS) {
    it(`'${key}' has both en and tr translations`, () => {
      const keyIndex = source.indexOf(`'${key}':`);
      expect(keyIndex, `Key '${key}' not found in messages.ts`).toBeGreaterThan(-1);

      // Extract block up to next key or closing brace
      const nextKeyIndex = source.indexOf("\n  '", keyIndex + 1);
      const blockEnd = nextKeyIndex !== -1 ? nextKeyIndex : source.indexOf('\n};', keyIndex);
      const block = source.slice(keyIndex, blockEnd > keyIndex ? blockEnd : source.length);

      expect(block, `Key '${key}' missing 'en:' translation`).toMatch(/\ben:/);
      expect(block, `Key '${key}' missing 'tr:' translation`).toMatch(/\btr:/);
    });
  }
});
