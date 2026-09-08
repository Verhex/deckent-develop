import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  calls: [] as Array<{ id: string; opts: unknown; execution: unknown }>,
  errors: [] as string[],
}));

vi.mock('../../../src/cli/commands/approvals.js', () => ({
  executeApprovalDecision: vi.fn(async (id: string, opts: unknown, execution: unknown) => {
    state.calls.push({ id, opts, execution });
  }),
}));
vi.mock('../../../src/cli/helpers/shutdown-hooks.js', () => ({
  withCommandLocalShutdown: async <T>(action: () => Promise<T>) => action(),
}));
vi.mock('../../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: (error: unknown) => state.errors.push(error instanceof Error ? error.message : String(error)),
}));

import {
  checkpointApprovalRequestId,
  registerCheckpoint,
} from '../../../src/cli/commands/checkpoint.js';

async function run(...args: string[]): Promise<void> {
  const program = new Command().exitOverride();
  registerCheckpoint(program);
  await program.parseAsync(['node', 'deckent', ...args]);
}

beforeEach(() => {
  state.calls = [];
  state.errors = [];
  process.exitCode = 0;
});

afterEach(() => { process.exitCode = 0; });

describe('checkpoint approval compatibility adapter', () => {
  it.each([
    ['approve', '719', 'plan', 'checkpoint-719-plan', { allow: true }],
    ['reject', 'sprint-719', 'evaluate', 'checkpoint-sprint-719-evaluate', { deny: true }],
    ['approve', 's1', 'fix', 'checkpoint-s1-fix', { allow: true }],
  ])('routes %s with its complete sprint/phase identity', async (action, sprintId, phase, id, opts) => {
    await run('checkpoint', action, sprintId, phase, '--lang', 'tr');

    expect(state.calls).toEqual([{
      id,
      opts,
      execution: { callerLocalLang: 'tr', requiredFederatedOrigin: 'checkpoint' },
    }]);
    expect(state.errors).toEqual([]);
  });

  it.each([
    ['../719', 'plan'],
    ['719/other', 'plan'],
    ['719\\other', 'plan'],
    ['719\0other', 'plan'],
    ['719', '../plan'],
    ['719', 'PLAN'],
    ['719', 'settle'],
  ])('rejects malformed identity %j/%j before the decision ingress', async (sprintId, phase) => {
    await run('checkpoint', 'approve', sprintId, phase, '--lang', 'en');

    expect(state.calls).toEqual([]);
    expect(state.errors.join('\n')).toContain('invalid-checkpoint-identity');
    expect(process.exitCode).toBe(1);
  });

  it('rejects missing and extra identity arguments through Commander', async () => {
    await expect(run('checkpoint', 'approve', '719')).rejects.toMatchObject({ code: 'commander.missingArgument' });
    await expect(run('checkpoint', 'reject', '719', 'fix', 'extra')).rejects.toMatchObject({
      code: 'commander.excessArguments',
    });
    expect(state.calls).toEqual([]);
  });

  it('derives only safe producer filename stems', () => {
    expect(checkpointApprovalRequestId('719', 'plan')).toBe('checkpoint-719-plan');
    expect(checkpointApprovalRequestId('sprint-719', 'evaluate')).toBe('checkpoint-sprint-719-evaluate');
    expect(checkpointApprovalRequestId('.', 'fix')).toBeUndefined();
  });
});
