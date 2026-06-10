// tests/core/config-cross-verify.test.ts
//
// Hermetic tests for cross_verify config block validation.
// No gitignored state read; no spawnSync; runs on fresh checkout.

import { describe, it, expect } from 'vitest';
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

/** Collect only cross_verify-related validation errors without rethrowing unrelated ones. */
function collectCrossVerifyErrors(config: DeckentConfig): string[] {
  try {
    validateConfig(config);
    return [];
  } catch (err: unknown) {
    if (err instanceof ConfigValidationError) {
      return err.errors.filter(e => e.includes('cross_verify'));
    }
    throw err;
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('cross_verify config block', () => {
  it('absent block produces no cross_verify errors (default off)', () => {
    const errors = collectCrossVerifyErrors(minimalConfig());
    expect(errors).toHaveLength(0);
  });

  it('accepts cross_verify with only enabled: true', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({ cross_verify: { enabled: true } }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts cross_verify with all fields set to valid values', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({
        cross_verify: {
          enabled: false,
          high_stakes_only: true,
          verifier_priority: ['codex', 'gemini', 'claude'],
        },
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('accepts custom verifier_priority values', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({
        cross_verify: {
          enabled: true,
          verifier_priority: ['gemini'],
        },
      }),
    );
    expect(errors).toHaveLength(0);
  });

  it('returns error when enabled is a non-boolean string', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({ cross_verify: { enabled: 'true' as unknown as boolean } }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/cross_verify\.enabled/);
  });

  it('returns error when high_stakes_only is a non-boolean value', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({
        cross_verify: {
          enabled: true,
          high_stakes_only: 1 as unknown as boolean,
        },
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/cross_verify\.high_stakes_only/);
  });

  it('returns error when verifier_priority is not an array', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({
        cross_verify: {
          enabled: true,
          verifier_priority: 'codex' as unknown as string[],
        },
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/cross_verify\.verifier_priority/);
  });

  it('returns error when verifier_priority contains a non-string element', () => {
    const errors = collectCrossVerifyErrors(
      minimalConfig({
        cross_verify: {
          enabled: true,
          verifier_priority: [42] as unknown as string[],
        },
      }),
    );
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatch(/cross_verify\.verifier_priority/);
  });
});
