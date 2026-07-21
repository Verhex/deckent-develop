import { describe, expect, it } from 'vitest';
import {
  ConfigValidationError,
  createDefaultConfig,
  mergeConfigs,
  validateConfig,
} from '../../src/core/config.js';
import type { DeckentConfig } from '../../src/core/config-types.js';

describe('execution_budget config round-trip', () => {
  it('stays absent by default instead of fabricating numerical ceilings', () => {
    expect(createDefaultConfig().execution_budget).toBeUndefined();
    expect(mergeConfigs(null, null).execution_budget).toBeUndefined();
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
    expect(resolved.execution_budget).toEqual({
      roles: {
        worker: {
          default: { maxTurns: 40, maxCacheReadTokens: 5_000_000 },
          by_task_kind: {
            documentation: { maxTurns: 10, maxCacheReadTokens: 500_000 },
          },
        },
      },
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
