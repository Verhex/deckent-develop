import { describe, expect, it, vi } from 'vitest';

import type { ExactNormalDockerExecutionRegistryV2 } from '../../src/orchestra/scheduler-effects.js';
import { prepareExactSprintLifecycle } from '../../src/orchestra/sprint-lifecycle.js';

describe('exact pause/resume custody boundary behavior', () => {
  it.each(['contain', 'resume'] as const)(
    'delegates %s to the registry recovery/adoption owner exactly once',
    async mode => {
      const reconcileExactLifecycle = vi.fn(async () => []);
      const registry = {
        reconcileExactLifecycle,
      } as unknown as ExactNormalDockerExecutionRegistryV2;

      await prepareExactSprintLifecycle(registry, mode);

      expect(reconcileExactLifecycle).toHaveBeenCalledTimes(1);
      expect(reconcileExactLifecycle).toHaveBeenCalledWith(mode);
    },
  );

  it('propagates a typed reconciliation HOLD instead of continuing projection', async () => {
    const hold = Object.assign(new Error('EXACT_LIFECYCLE_CONTAIN_HOLD'), {
      code: 'DECKENT_E091',
    });
    const registry = {
      reconcileExactLifecycle: vi.fn(async () => { throw hold; }),
    } as unknown as ExactNormalDockerExecutionRegistryV2;

    await expect(prepareExactSprintLifecycle(registry, 'contain')).rejects.toBe(hold);
  });
});
