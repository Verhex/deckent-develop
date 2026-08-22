import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import {
  applyForceArchiveManifests,
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
} from '../../src/orchestra/sprint-recovery-operation.js';

describe('force recovery checkpoint preservation', () => {
  const roots: string[] = [];
  afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));

  function fixture(): { root: string; checkpointPath: string } {
    const root = mkdtempSync(join(tmpdir(), 'recover-checkpoint-policy-'));
    roots.push(root);
    mkdirSync(join(root, '.deckent'), { recursive: true });
    mkdirSync(join(root, '.tasks'), { recursive: true });
    writeFileSync(join(root, '.deckent', 'sprint-state.json'), JSON.stringify({
      sprintId: 'sprint-595', phase: 'EXECUTE', status: 'PAUSED', taskIds: ['595-014'],
    }));
    writeFileSync(join(root, '.deckent', 'pause-state.json'), JSON.stringify({
      sprintId: 'sprint-595', phase: 'EXECUTE', status: 'PAUSED',
    }));
    writeFileSync(join(root, '.tasks', 'task-595-014.json'), JSON.stringify({
      id: '595-014', sprintId: 'sprint-595', status: 'PAUSED',
    }));
    const checkpointPath = join(root, '.deckent', 'sprint-595-checkpoint.json');
    writeFileSync(checkpointPath, JSON.stringify({
      sprintId: 'sprint-595', checkpointNumber: 14,
      timestamp: '2026-08-22T00:00:00.000Z', completedTasks: [],
      pendingTasks: ['595-014'], activeWorkers: [], brainPhase: 'EXECUTE', eventStreamOffset: 4,
    }, null, 2));
    return { root, checkpointPath };
  }

  it('reports the same digest-bound preservation disposition in dry-run and apply', async () => {
    const { root, checkpointPath } = fixture();
    const before = readFileSync(checkpointPath);
    const expectedDigest = `sha256:${createHash('sha256').update(before).digest('hex')}`;
    const dryRun = await runSprintRecoveryOperation(root, 'sprint-595', { dryRun: true });
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-595');
    const applied = await runSprintRecoveryOperation(root, 'sprint-595', {
      skipAudit: true,
      approval: { approvalRef: 'test:force', idempotencyKey: 'exact', identity },
    });

    expect(dryRun.artifactPolicy).toEqual(applied.artifactPolicy);
    expect(applied.artifactPolicy.checkpoint).toEqual({
      disposition: 'preserved', digest: expectedDigest, reason: 'CHECKPOINT_SUPERSESSION_REQUIRED',
    });
    expect(readFileSync(checkpointPath)).toEqual(before);
    expect(applied.taskFilesPreserved).toBeGreaterThan(0);
    expect(applied.remediation).toMatchObject({ lifecycle: 'PAUSED' });
  });

  it('keeps task residue archive behavior and emits its policy manifest', async () => {
    const { root, checkpointPath } = fixture();
    const residuePath = join(root, '.tasks', 'task-595-015.json');
    const residueBytes = JSON.stringify({
      id: '595-015', sprintId: 'sprint-595', status: 'DONE',
    });
    writeFileSync(residuePath, residueBytes);
    const identity = readSprintRecoverySettlementIdentity(root, 'sprint-595');
    const report = await runSprintRecoveryOperation(root, 'sprint-595', {
      skipAudit: true,
      approval: { approvalRef: 'test:force', idempotencyKey: 'exact', identity },
    });
    expect(report.taskFilesArchived).toBe(1);
    expect(report.artifactPolicy.archiveManifests).toHaveLength(1);
    expect(report.artifactPolicy.archiveManifests[0]).toMatchObject({
      artifactClass: 'task-residue', operation: 'force-archive',
      restoreSemantics: 'restore-to-source-if-owner-current',
    });
    const destination = report.artifactPolicy.archiveManifests[0]!.destination;
    expect(readFileSync(destination, 'utf8')).toBe(residueBytes);
    expect(() => readFileSync(residuePath)).toThrow();
    expect(readFileSync(checkpointPath)).toBeTruthy();
  });

  it('fails closed when source bytes drift after manifest authorization', async () => {
    const { root } = fixture();
    const residuePath = join(root, '.tasks', 'task-595-015.json');
    writeFileSync(residuePath, JSON.stringify({
      id: '595-015', sprintId: 'sprint-595', status: 'DONE',
    }));
    const dryRun = await runSprintRecoveryOperation(root, 'sprint-595', { dryRun: true });
    writeFileSync(residuePath, JSON.stringify({
      id: '595-015', sprintId: 'sprint-595', status: 'NO_GO',
    }));

    expect(() => applyForceArchiveManifests(dryRun.artifactPolicy.archiveManifests))
      .toThrowError(expect.objectContaining({
        code: 'SETTLEMENT_FAILED',
        details: expect.objectContaining({ reason: 'archive-source-digest-mismatch' }),
      }));
    expect(readFileSync(residuePath, 'utf8')).toContain('NO_GO');
    expect(() => readFileSync(dryRun.artifactPolicy.archiveManifests[0]!.destination)).toThrow();
  });
});
