import { describe, expect, it, vi } from 'vitest';

import {
  deriveDefaultExecution,
  getContract,
} from '../../src/core/cli-command-contract.js';
import { WATCH_CAPABILITY_ID } from '../../src/intelligence/watch-capability.js';
import { registerWatchFlow } from '../../src/intelligence/watch-flow.js';

describe('intelligence CLI command contract', () => {
  it('keeps interactive model activation targets optional and offline-capable', () => {
    for (const path of ['models activate', 'models deactivate']) {
      expect(getContract(path)).toMatchObject({
        arguments: [{ name: 'model', required: false, variadic: false }],
        options: [
          { flags: '--provider <name>' },
          { flags: '--offline' },
        ],
      });
    }
  });

  it('preserves the task settlement reason-code authority flag', () => {
    expect(getContract('task settle')?.options.map(({ flags }) => flags))
      .toContain('--reason-code <code>');
  });

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
