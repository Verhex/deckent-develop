import { describe, expect, it } from 'vitest';
import {
  ConfigValidationError,
  createDefaultConfig,
  mergeConfigs,
  validateConfig,
} from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/config-types.js';

describe('execution_budget config round-trip', () => {
  // KN2 (GR-2026-08-08-DOGFOOD-KN2-01, owner karar-turu 2026-08-08): the
  // default config now AUTHORS a worker execution-budget policy. The old pin
  // ("stays absent by default") guarded against hidden runtime fabrication —
  // that guarantee still holds, but the values are now authored ONCE in the
  // canonical default-config body and written into the user's visible
  // config.json at init (explicit config, not a hidden fallback). Without it,
  // the 2026-08-07 cold-start smoke measured every remote-class spawn dying
  // on the typed `budget-policy-missing` hold.
  it('authors a visible default worker policy (cold-start can spawn; owner can edit)', () => {
    const def = createDefaultConfig().execution_budget;
    expect(def).toBeDefined();
    expect(def!.roles.worker?.default).toBeDefined();
    expect(def!.landing?.reserve_ratio).toBeGreaterThan(0);
    // The default stays fail-closed for final-only providers: no blanket grant.
    expect(def!.final_only_usage).toBeUndefined();
    expect(mergeConfigs(null, null).execution_budget).toEqual(def);
  });

  it('deep-merges global role defaults with project TaskKind profiles', () => {
    const resolved = mergeConfigs(
      {
        execution_budget: {
          roles: {
            worker: { default: { maxTurns: 40, maxCacheReadTokens: 5_000_000 } },
          },
          unmetered_backend: { action: 'hold' },
        },
      },
      {
        execution_budget: {
          roles: {
            worker: {
              by_task_kind: {
                documentation: { maxTurns: 10, maxCacheReadTokens: 500_000 },
              },
            },
          },
          unmetered_backend: {
            action: 'reroute-or-hold',
            ordered_backends: ['docker'],
          },
        },
      },
    );
    // KN2: the default config contributes a landing block; global/project
    // overlays deep-merge ON TOP of it, so the merged policy carries the
    // default landing unless an overlay overrides it.
    expect(resolved.execution_budget).toEqual({
      roles: {
        worker: {
          // Field-wise deep-merge: the overlay's keys win, the default's
          // remaining ceilings (referenced, not re-declared) are inherited.
          default: {
            ...createDefaultConfig().execution_budget!.roles.worker!.default,
            maxTurns: 40,
            maxCacheReadTokens: 5_000_000,
          },
          by_task_kind: {
            documentation: { maxTurns: 10, maxCacheReadTokens: 500_000 },
          },
        },
      },
      landing: createDefaultConfig().execution_budget!.landing,
      unmetered_backend: {
        action: 'reroute-or-hold',
        ordered_backends: ['docker'],
      },
    });
  });

  it('surfaces malformed JSON policy through canonical config validation', () => {
    const config = createDefaultConfig();
    config.execution_budget = {
      roles: { worker: { default: { maxTurns: -1 } } },
    } as DeckentConfig['execution_budget'];
    expect(() => validateConfig(config)).toThrow(ConfigValidationError);
    expect(() => validateConfig(config)).toThrow('execution_budget.roles.worker.default.maxTurns');
  });
});
