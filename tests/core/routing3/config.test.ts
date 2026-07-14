// tests/core/routing3/config.test.ts
// Sprint 445 Task 445-010 — routing_v3 config schema + 3-layer merge.
// Hermetic: no gitignored state, no disk I/O, no spawn.

import { describe, it, expect } from 'vitest';
import {
  DEFAULT_ROUTING_V3_CONFIG,
  ROUTING_V3_SCHEMA,
  InvalidRoutingV3ConfigError,
  RoutingV3WeightsSumError,
  validateRoutingV3Config,
  resolveRoutingV3Config,
} from '../../../src/core/routing3/config.js';
import { DeckentError } from '../../../src/core/errors.js';
import type { DeckentConfig, RoutingV3Config } from '../../../src/core/config-types.js';

describe('DEFAULT_ROUTING_V3_CONFIG', () => {
  it('defaults enabled to false (cut-over flips in Slice-3)', () => {
    expect(DEFAULT_ROUTING_V3_CONFIG.enabled).toBe(false);
  });

  it('default weights sum to 1.0 (content 0.5, positional 0.3, numerical 0.2)', () => {
    const { weights } = DEFAULT_ROUTING_V3_CONFIG;
    expect(weights).toEqual({ content: 0.5, positional: 0.3, numerical: 0.2 });
    expect(weights.content + weights.positional + weights.numerical).toBeCloseTo(1.0, 9);
  });

  it('passes its own schema + weights-sum validation', () => {
    expect(() => validateRoutingV3Config(DEFAULT_ROUTING_V3_CONFIG)).not.toThrow();
  });
});

describe('ROUTING_V3_SCHEMA', () => {
  it('accepts the default config', () => {
    const result = ROUTING_V3_SCHEMA.safeParse(DEFAULT_ROUTING_V3_CONFIG);
    expect(result.success).toBe(true);
  });

  it('rejects an unknown extra field (strict schema)', () => {
    const result = ROUTING_V3_SCHEMA.safeParse({ ...DEFAULT_ROUTING_V3_CONFIG, extra: 'nope' });
    expect(result.success).toBe(false);
  });

  it('rejects governanceMode outside the closed enum', () => {
    const result = ROUTING_V3_SCHEMA.safeParse({
      ...DEFAULT_ROUTING_V3_CONFIG,
      governanceMode: 'turbo',
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-positive topK', () => {
    const result = ROUTING_V3_SCHEMA.safeParse({ ...DEFAULT_ROUTING_V3_CONFIG, topK: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects confidenceFloor outside [0,1]', () => {
    const result = ROUTING_V3_SCHEMA.safeParse({ ...DEFAULT_ROUTING_V3_CONFIG, confidenceFloor: 1.5 });
    expect(result.success).toBe(false);
  });
});

describe('validateRoutingV3Config — weights-sum validation', () => {
  it('throws RoutingV3WeightsSumError when weights sum to less than 1.0', () => {
    const bad: RoutingV3Config = {
      ...DEFAULT_ROUTING_V3_CONFIG,
      weights: { content: 0.5, positional: 0.3, numerical: 0.1 },
    };
    expect(() => validateRoutingV3Config(bad)).toThrow(RoutingV3WeightsSumError);
  });

  it('throws RoutingV3WeightsSumError when weights sum to more than 1.0', () => {
    const bad: RoutingV3Config = {
      ...DEFAULT_ROUTING_V3_CONFIG,
      weights: { content: 0.6, positional: 0.3, numerical: 0.2 },
    };
    expect(() => validateRoutingV3Config(bad)).toThrow(RoutingV3WeightsSumError);
  });

  it('RoutingV3WeightsSumError is a DeckentError with the offending sum + weights', () => {
    const bad: RoutingV3Config = {
      ...DEFAULT_ROUTING_V3_CONFIG,
      weights: { content: 0.5, positional: 0.3, numerical: 0.3 },
    };
    try {
      validateRoutingV3Config(bad);
      expect.unreachable('expected RoutingV3WeightsSumError to throw');
    } catch (e) {
      expect(e).toBeInstanceOf(DeckentError);
      expect(e).toBeInstanceOf(RoutingV3WeightsSumError);
      const err = e as RoutingV3WeightsSumError;
      expect(err.code).toBe('ROUTING3_INVALID_WEIGHTS_SUM');
      expect(err.sum).toBeCloseTo(1.1, 9);
      expect(err.weights).toEqual({ content: 0.5, positional: 0.3, numerical: 0.3 });
    }
  });

  it('accepts a valid non-default weight distribution that sums to exactly 1.0', () => {
    const ok: RoutingV3Config = {
      ...DEFAULT_ROUTING_V3_CONFIG,
      weights: { content: 0.34, positional: 0.33, numerical: 0.33 },
    };
    expect(() => validateRoutingV3Config(ok)).not.toThrow();
  });

  it('throws InvalidRoutingV3ConfigError (not the weights error) for a malformed shape', () => {
    const bad = { ...DEFAULT_ROUTING_V3_CONFIG, topK: -1 } as RoutingV3Config;
    expect(() => validateRoutingV3Config(bad)).toThrow(InvalidRoutingV3ConfigError);
  });
});

describe('resolveRoutingV3Config — 3-layer merge (default -> global -> project)', () => {
  it('returns the default config when neither global nor project override anything', () => {
    const resolved = resolveRoutingV3Config(null, null);
    expect(resolved).toEqual(DEFAULT_ROUTING_V3_CONFIG);
  });

  it('returns the default config when both args are omitted', () => {
    const resolved = resolveRoutingV3Config();
    expect(resolved).toEqual(DEFAULT_ROUTING_V3_CONFIG);
  });

  it('global config overrides defaults', () => {
    const globalConfig: Partial<DeckentConfig> = {
      routing_v3: { enabled: true, topK: 8 },
    };
    const resolved = resolveRoutingV3Config(globalConfig, null);
    expect(resolved.enabled).toBe(true);
    expect(resolved.topK).toBe(8);
    // untouched fields still fall back to default
    expect(resolved.weights).toEqual(DEFAULT_ROUTING_V3_CONFIG.weights);
    expect(resolved.governanceMode).toBe('ai');
  });

  it('project config overrides global config, which overrides defaults', () => {
    const globalConfig: Partial<DeckentConfig> = {
      routing_v3: { enabled: true, topK: 8, governanceMode: 'deterministic' },
    };
    const projectConfig: Partial<DeckentConfig> = {
      routing_v3: { topK: 3 },
    };
    const resolved = resolveRoutingV3Config(globalConfig, projectConfig);
    // project wins on the field it sets
    expect(resolved.topK).toBe(3);
    // global still wins on fields project didn't touch
    expect(resolved.enabled).toBe(true);
    expect(resolved.governanceMode).toBe('deterministic');
    // default still wins on fields neither layer touched
    expect(resolved.confidenceFloor).toBe(DEFAULT_ROUTING_V3_CONFIG.confidenceFloor);
  });

  it('project can override a global override back toward a default-adjacent value', () => {
    const globalConfig: Partial<DeckentConfig> = {
      routing_v3: { weights: { content: 0.7, positional: 0.2, numerical: 0.1 } },
    };
    const projectConfig: Partial<DeckentConfig> = {
      routing_v3: { weights: { content: 0.5, positional: 0.3, numerical: 0.2 } },
    };
    const resolved = resolveRoutingV3Config(globalConfig, projectConfig);
    expect(resolved.weights).toEqual({ content: 0.5, positional: 0.3, numerical: 0.2 });
  });

  it('propagates RoutingV3WeightsSumError when the final merged weights are invalid', () => {
    const projectConfig: Partial<DeckentConfig> = {
      routing_v3: { weights: { content: 0.9, positional: 0.3, numerical: 0.2 } },
    };
    expect(() => resolveRoutingV3Config(null, projectConfig)).toThrow(RoutingV3WeightsSumError);
  });
});
