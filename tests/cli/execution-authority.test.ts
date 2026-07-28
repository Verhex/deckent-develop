import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/cli/helpers/output.js', () => ({
  print: vi.fn(),
  printError: vi.fn(),
}));

import {
  registerExecutionAuthorityCommand,
  type ExecutionAuthorityMountAdoptDto,
} from '../../src/cli/commands/execution-authority.js';
import {
  ExecutionLockError,
  type ExecutionLockMountAdoptionResult,
} from '../../src/core/file-lock.js';
import { print, printError } from '../../src/cli/helpers/output.js';

function result(
  decision: ExecutionLockMountAdoptionResult['decision'],
): ExecutionLockMountAdoptionResult {
  return {
    schemaVersion: 1,
    decision,
    authorityEpoch: '10000000-0000-4000-8000-000000000001',
    previous: {
      projectDev: '1',
      projectIno: '2',
      locksDev: '1',
      locksIno: '3',
      mountId: '41',
    },
    current: {
      projectDev: '1',
      projectIno: '2',
      locksDev: '1',
      locksIno: '3',
      mountId: '42',
    },
    evidenceRefs: ['authority-epoch:10000000-0000-4000-8000-000000000001'],
  };
}

async function run(
  args: readonly string[],
  adoptMount: ReturnType<typeof vi.fn>,
): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerExecutionAuthorityCommand(program, {
    resolveProjectRootFn: () => '/project',
    adoptMount,
    now: () => Date.parse('2026-07-28T12:00:00.000Z'),
  });
  await program.parseAsync(['node', 'deckent', ...args]);
}

function lastJson(): ExecutionAuthorityMountAdoptDto {
  const raw = vi.mocked(print).mock.calls.at(-1)?.[0];
  if (typeof raw !== 'string') throw new Error('missing JSON output');
  return JSON.parse(raw) as ExecutionAuthorityMountAdoptDto;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.exitCode = undefined;
});

describe('execution-authority mount-adopt CLI', () => {
  it('is a machine-readable dry-run by default', async () => {
    const adoptMount = vi.fn(() => result('eligible'));

    await run(['execution-authority', 'mount-adopt', '--json'], adoptMount);

    expect(adoptMount).toHaveBeenCalledWith('/project', {
      apply: false,
      now: expect.any(Function),
    });
    expect(lastJson()).toMatchObject({
      schemaVersion: 1,
      command: 'execution-authority.mount-adopt',
      mode: 'dry-run',
      decision: 'eligible',
      previous: { mountId: '41' },
      current: { mountId: '42' },
    });
  });

  it('requires explicit operator and justification before apply', async () => {
    const adoptMount = vi.fn(() => result('adopted'));

    await run([
      'execution-authority',
      'mount-adopt',
      '--apply',
      '--operator',
      'operator-1',
    ], adoptMount);

    expect(adoptMount).not.toHaveBeenCalled();
    expect(printError).toHaveBeenCalledTimes(1);
    expect(process.exitCode).toBe(1);
  });

  it('forwards a bounded explicit attestation and emits the adopted DTO', async () => {
    const adoptMount = vi.fn(() => result('adopted'));

    await run([
      'execution-authority',
      'mount-adopt',
      '--apply',
      '--operator',
      'operator-1',
      '--justification',
      'verified remount',
      '--json',
    ], adoptMount);

    expect(adoptMount).toHaveBeenCalledWith('/project', {
      apply: true,
      operatorId: 'operator-1',
      justification: 'verified remount',
      now: expect.any(Function),
    });
    expect(lastJson()).toMatchObject({
      mode: 'apply',
      decision: 'adopted',
    });
  });

  it('maps authority refusal to a localized error without leaking core text', async () => {
    const adoptMount = vi.fn(() => {
      throw new ExecutionLockError(
        'sensitive internal authority path',
        'unknown',
        'project-active',
      );
    });

    await run([
      'execution-authority',
      'mount-adopt',
      '--apply',
      '--operator',
      'operator-1',
      '--justification',
      'verified remount',
    ], adoptMount);

    const printed = vi.mocked(printError).mock.calls.at(-1)?.[0];
    expect(printed).toBeInstanceOf(Error);
    expect((printed as Error).message).toContain('project-active');
    expect((printed as Error).message).not.toContain('sensitive internal authority path');
    expect(process.exitCode).toBe(1);
  });
});
