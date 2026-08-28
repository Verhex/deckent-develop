import { describe, expect, it, vi } from 'vitest';

import {
  deriveDefaultExecution,
  getContract,
} from '../../src/core/cli-command-contract.js';
import { WATCH_CAPABILITY_ID } from '../../src/intelligence/watch-capability.js';
import { registerWatchFlow } from '../../src/intelligence/watch-flow.js';

describe('intelligence CLI command contract', () => {
  it('catalogs the complete command family and exact watch flags', () => {
    expect(getContract('intelligence')).toMatchObject({ effect: 'group' });
    expect(getContract('intelligence watch')).toMatchObject({ effect: 'group' });
    expect(getContract('intelligence watch run')?.options.map(({ flags }) => flags))
      .toEqual(['--dry-run', '--input <fixture>']);
    expect(getContract('intelligence schedule')).toMatchObject({
      effect: 'local-write',
    });
    expect(getContract('intelligence status')).toMatchObject({ effect: 'read' });
  });

  it('keeps the run contract applying by default while exposing dry-run', () => {
    const run = getContract('intelligence watch run');
    expect(run?.defaultExecution).toBe('apply');
    expect(deriveDefaultExecution(
      run?.effect ?? 'read',
      run?.options.map(({ flags }) => flags) ?? [],
    )).toBe('apply');
  });

  it('shares the scheduled flow capability id', () => {
    const flows = {
      getFlow: () => undefined,
      addFlow: vi.fn(),
    };
    const flow = registerWatchFlow(flows as never);
    expect(flow.action).toBe(WATCH_CAPABILITY_ID);
  });
});
