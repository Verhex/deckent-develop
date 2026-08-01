import { EventEmitter } from 'node:events';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runResumeRecoveryProcess } from '../../src/cli/commands/recover.js';

function pausedFixture(sprintId = 'sprint-907'): string {
  const root = mkdtempSync(join(tmpdir(), 'deckent-recover-resume-'));
  onTestFinished(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, '.deckent'), { recursive: true });
  writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
    sprintId,
    phase: 'EVALUATE',
    status: 'PAUSED',
  }));
  writeFileSync(join(root, '.deckent', 'pause-state.json'), JSON.stringify({
    sprintId,
    phase: 'EVALUATE',
    status: 'PAUSED',
  }));
  writeFileSync(join(root, '.deckent', `${sprintId}-checkpoint.json`), '{}');
  return root;
}

describe('recover --resume process handoff', () => {
  it('delegates mutation to the canonical resume command with exact flags', async () => {
    const sprintId = 'sprint-907';
    const root = pausedFixture(sprintId);
    const child = new EventEmitter();
    const spawnProcess = vi.fn(() => {
      queueMicrotask(() => child.emit('close', 0));
      return child;
    });

    await expect(runResumeRecoveryProcess(root, sprintId, {
      autoApprove: true,
      dryRun: true,
      acknowledgeScopePaths: true,
    }, {
      execPath: '/usr/bin/node',
      entryPath: '/opt/deckent/entry.js',
      spawnProcess: spawnProcess as never,
    })).resolves.toEqual({ dryRun: true, exitCode: 0, outcome: null });

    expect(spawnProcess).toHaveBeenCalledWith(
      '/usr/bin/node',
      [
        '/opt/deckent/entry.js',
        'resume',
        sprintId,
        '--root',
        root,
        '--auto-approve',
        '--dry-run',
        '--force-scope',
      ],
      expect.objectContaining({ cwd: root, shell: false, stdio: 'inherit' }),
    );
  });

  it('requires an exact child outcome artifact and preserves PAUSED as typed operator action', async () => {
    const sprintId = 'sprint-909';
    const root = pausedFixture(sprintId);
    const child = new EventEmitter();
    const spawnProcess = vi.fn((_execPath: string, args: string[]) => {
      const outcomeArgIndex = args.indexOf('--outcome-file');
      const outcomePath = args[outcomeArgIndex + 1]!;
      mkdirSync(join(root, '.deckent', 'runtime'), { recursive: true });
      writeFileSync(outcomePath, JSON.stringify({
        schemaVersion: 1,
        sprintId,
        outcome: 'resumed-paused',
        exitCode: 2,
        observedStatus: 'PAUSED',
        observedAt: '2026-08-01T00:00:00.000Z',
        reason: 'operator-decision-required',
        nextAuthority: {
          lifecycle: 'PAUSED',
          resumable: true,
          recoveryCommand: `deckent recover ${sprintId} --resume`,
          finalizeCommand: `deckent finalize --sprint ${sprintId} --force`,
        },
      }));
      queueMicrotask(() => child.emit('close', 2));
      return child;
    });

    const result = await runResumeRecoveryProcess(root, sprintId, {}, {
      execPath: '/usr/bin/node',
      entryPath: '/opt/deckent/entry.js',
      spawnProcess: spawnProcess as never,
    });

    expect(result).toMatchObject({
      dryRun: false,
      exitCode: 2,
      outcome: { outcome: 'resumed-paused', exitCode: 2 },
    });
    expect(spawnProcess.mock.calls[0]![1]).toContain('--outcome-file');
  });

  it('refuses resume when no canonical resumable authority exists', async () => {
    const root = mkdtempSync(join(tmpdir(), 'deckent-recover-resume-idle-'));
    onTestFinished(() => rmSync(root, { recursive: true, force: true }));

    await expect(runResumeRecoveryProcess(root, 'sprint-908', {}, {
      execPath: '/usr/bin/node',
      entryPath: '/opt/deckent/entry.js',
    })).rejects.toThrow('no canonical resumable PAUSED/ORPHANED authority');
  });
});
