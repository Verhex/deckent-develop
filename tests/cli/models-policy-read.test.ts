import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  print: vi.fn(),
  printError: vi.fn(),
  setProviderPolicy: vi.fn(),
  storeOptions: [] as unknown[],
}));

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: state.print,
  printError: state.printError,
}));

vi.mock('../../src/cli/helpers/process.js', () => ({
  resolveProjectRoot: () => '/tmp/deckent-models-policy-read',
}));

vi.mock('../../src/core/model-activation-store.js', () => ({
  PROVIDER_POLICY_MODES: ['implicit-active', 'explicit-active'],
  ModelActivationStore: class {
    constructor(_projectRoot: string, options?: unknown) {
      state.storeOptions.push(options);
    }

    getProviderPolicy(provider: string): 'implicit-active' | 'explicit-active' {
      return provider === 'claude' ? 'explicit-active' : 'implicit-active';
    }

    listProviderPolicies(): Array<{
      provider: string;
      mode: 'explicit-active';
      actor: string;
      updatedAt: string;
    }> {
      return [{
        provider: 'claude',
        mode: 'explicit-active',
        actor: 'owner',
        updatedAt: '2026-09-03T00:00:00.000Z',
      }];
    }

    setProviderPolicy(provider: string, mode: string): void {
      state.setProviderPolicy(provider, mode);
    }

    close(): void {}
  },
  resolveActiveModelPolicy: () => ({
    snapshotDigest: '0'.repeat(64),
    explicitProviders: new Set<string>(),
    activeModels: [],
  }),
}));

import { registerModels } from '../../src/cli/commands/models.js';

async function runPolicy(...args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerModels(program);
  await program.parseAsync(['node', 'deckent', 'models', 'policy', ...args]);
}

describe('models policy provider read path', () => {
  beforeEach(() => {
    state.print.mockReset();
    state.printError.mockReset();
    state.setProviderPolicy.mockReset();
    state.storeOptions.length = 0;
    process.exitCode = undefined;
  });

  it('reads one provider when mode is omitted and never mutates policy', async () => {
    await runPolicy('claude');

    expect(state.printError).not.toHaveBeenCalled();
    expect(state.setProviderPolicy).not.toHaveBeenCalled();
    expect(state.storeOptions).toEqual([{ readOnly: true }]);
    expect(process.exitCode).toBeUndefined();
    const output = state.print.mock.calls.flat().join('\n');
    expect(output).toContain('claude');
    expect(output).toContain('explicit-active');
  });

  it('retains the explicit two-argument mutation path', async () => {
    await runPolicy('claude', 'implicit-active');

    expect(state.printError).not.toHaveBeenCalled();
    expect(state.setProviderPolicy).toHaveBeenCalledWith('claude', 'implicit-active');
    expect(state.storeOptions).toEqual([{ readOnly: false }]);
  });
});
