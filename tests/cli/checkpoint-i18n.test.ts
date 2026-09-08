import { Command } from 'commander';
import { afterEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  execution: [] as Array<Record<string, unknown>>,
  errors: [] as string[],
}));

vi.mock('../../src/cli/commands/approvals.js', () => ({
  executeApprovalDecision: vi.fn(async (_id: string, _opts: unknown, execution: Record<string, unknown>) => {
    state.execution.push(execution);
  }),
}));
vi.mock('../../src/cli/helpers/shutdown-hooks.js', () => ({
  withCommandLocalShutdown: async <T>(action: () => Promise<T>) => action(),
}));
vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: (error: unknown) => state.errors.push(error instanceof Error ? error.message : String(error)),
}));

import { registerCheckpoint } from '../../src/cli/commands/checkpoint.js';
import { getMessage } from '../../src/cli/helpers/messages.js';

function registered(): Command {
  const program = new Command().exitOverride();
  registerCheckpoint(program);
  return program;
}

afterEach(() => {
  vi.unstubAllEnvs();
  state.execution = [];
  state.errors = [];
  process.exitCode = 0;
});

describe('checkpoint compatibility i18n', () => {
  it('binds bilingual descriptions and positional help on the real child commands', () => {
    vi.stubEnv('DECKENT_LANGUAGE', 'tr');
    const checkpoint = registered().commands.find(command => command.name() === 'checkpoint');
    const approve = checkpoint?.commands.find(command => command.name() === 'approve');
    const reject = checkpoint?.commands.find(command => command.name() === 'reject');

    expect(approve?.description()).toBe(getMessage('cli.checkpoint.approve.desc', 'tr'));
    expect(reject?.description()).toBe(getMessage('cli.checkpoint.reject.desc', 'tr'));
    expect(approve?.options[0]?.description).toBe(getMessage('checkpoint.lang_option', 'tr'));
    expect(approve?.registeredArguments.map(argument => argument.description)).toEqual([
      'Checkpoint’in ait olduğu sprint',
      'Checkpoint’in oluşturulduğu sprint aşaması',
    ]);
  });

  it('keeps --lang caller-local while routing to the authenticated ingress', async () => {
    vi.stubEnv('DECKENT_LANGUAGE', 'en');
    await registered().parseAsync(
      ['node', 'deckent', 'checkpoint', 'reject', 's1', 'evaluate', '--lang', 'tr'],
    );

    expect(state.execution).toEqual([{
      callerLocalLang: 'tr',
      requiredFederatedOrigin: 'checkpoint',
    }]);
  });

  it('localizes an invalid adapter identity without claiming a checkpoint write', async () => {
    await registered().parseAsync(
      ['node', 'deckent', 'checkpoint', 'approve', '../s1', 'plan', '--lang', 'tr'],
    );

    expect(state.execution).toEqual([]);
    expect(state.errors).toEqual([getMessage('approvals.decision_refused', 'tr', {
      id: 'checkpoint-input',
      kind: 'invalid-input',
      reason: 'invalid-checkpoint-identity',
    })]);
  });
});
