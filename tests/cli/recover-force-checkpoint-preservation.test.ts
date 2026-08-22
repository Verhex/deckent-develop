import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Command } from 'commander';

const mocks = vi.hoisted(() => ({ print: vi.fn(), printError: vi.fn(), lang: 'en' }));
vi.mock('../../src/cli/helpers/output.js', () => ({ print: mocks.print, printError: mocks.printError }));
vi.mock('../../src/cli/helpers/process.js', () => ({ resolveProjectRoot: () => '/fixture' }));
vi.mock('../../src/cli/helpers/i18n.js', () => ({ detectLang: () => mocks.lang }));
vi.mock('../../src/orchestra/task-restoration.js', () => ({ restoreFromSnapshot: vi.fn() }));
vi.mock('../../src/orchestra/sprint-recovery-operation.js', () => ({
  SprintRecoveryOperationError: class extends Error {},
  readSprintRecoverySettlementIdentity: () => ({
    executionId: 'sprint-595', generation: 14, taskId: 'sprint-595',
    attemptId: 'sprint-595:recovery:14', fenceToken: 'fence',
  }),
  runSprintRecoveryOperation: vi.fn(async () => ({
    identity: { executionId: 'sprint-595', generation: 14, taskId: 'sprint-595', attemptId: 'sprint-595:recovery:14', fenceToken: 'fence' },
    audit: { overallGate: 'SKIPPED' }, orphanIpcDirs: [], staleLocksCleaned: 0,
    staleSpawnLocksCleaned: 0, taskFilesArchived: 0, taskFilesPreserved: 1,
    artifactPolicy: { policyVersion: 1, archiveManifests: [], checkpoint: {
      disposition: 'preserved', digest: `sha256:${'a'.repeat(64)}`, reason: 'CHECKPOINT_SUPERSESSION_REQUIRED',
    } },
    remediation: { lifecycle: 'PAUSED', resumeCommand: 'deckent recover sprint-595 --resume', finalizeCommand: 'deckent finalize --sprint sprint-595 --force' },
  })),
}));

import { registerRecover } from '../../src/cli/commands/recover.js';

async function run(args: string[]): Promise<void> {
  const program = new Command();
  program.exitOverride();
  registerRecover(program);
  await program.parseAsync(['node', 'test', 'recover', ...args]);
}

describe('recover force checkpoint preservation CLI', () => {
  beforeEach(() => { vi.clearAllMocks(); process.exitCode = undefined; mocks.lang = 'en'; });

  it.each([['--dry-run'], ['--force']])('reports identical preservation and canonical PAUSED remediation for %s', async flag => {
    await run(['sprint-595', flag]);
    const output = mocks.print.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain(`preserved (sha256:${'a'.repeat(64)})`);
    expect(output).toContain('deckent recover sprint-595 --resume');
    expect(output).toContain('deckent finalize --sprint sprint-595 --force');
  });

  it('renders the canonical commands through Turkish i18n', async () => {
    mocks.lang = 'tr';
    await run(['sprint-595', '--dry-run']);
    const output = mocks.print.mock.calls.map(([line]) => String(line)).join('\n');
    expect(output).toContain('ile sürdürün');
    expect(output).toContain('ile sonlandırın');
  });

  it('projects the policy disposition and remediation in stable JSON', async () => {
    await run(['sprint-595', '--force', '--json']);
    const value = mocks.print.mock.calls.map(([line]) => String(line)).find(line => line.startsWith('{'))!;
    expect(JSON.parse(value)).toMatchObject({
      artifactPolicy: { checkpoint: { disposition: 'preserved', reason: 'CHECKPOINT_SUPERSESSION_REQUIRED' } },
      remediation: { lifecycle: 'PAUSED' },
    });
  });
});
