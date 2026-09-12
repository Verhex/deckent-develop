import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { savePlannedSprint, saveRunHandle } from '../../src/core/run-flow-store.js';
import {
  readSprintRecoverySettlementIdentity,
  runSprintRecoveryOperation,
} from '../../src/orchestra/sprint-recovery-operation.js';

describe('recovery preserves the durable prerequisites of a retained resume checkpoint', () => {
  const roots: string[] = [];
  afterEach(() => {
    for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
  });

  function fixture(stateSprintId = 'sprint-913') {
    const root = mkdtempSync(join(tmpdir(), 'recovery-resume-state-'));
    roots.push(root);
    mkdirSync(join(root, '.deckent'), { recursive: true });
    const statePath = join(root, '.deckent', 'sprint-state.json');
    const stateBytes = JSON.stringify({ sprintId: stateSprintId, status: 'FAILED', phase: 'EXECUTE',
      startedAt: '2026-09-12T00:00:00.000Z', updatedAt: '2026-09-12T00:01:00.000Z', taskIds: ['913-001'] });
    writeFileSync(statePath, stateBytes);
    const checkpointPath = join(root, '.deckent', 'sprint-913-checkpoint.json');
    const checkpointBytes = JSON.stringify({ sprintId: 'sprint-913', checkpointNumber: 1,
      timestamp: '2026-09-12T00:01:00.000Z', brainPhase: 'EXECUTE', eventStreamOffset: 0,
      completedTasks: [], pendingTasks: [], activeWorkers: [] });
    writeFileSync(checkpointPath, checkpointBytes);
    return { root, statePath, stateBytes, checkpointPath, checkpointBytes };
  }

  async function recover(root: string, dryRun = false) {
    const fixtureReceiptDigest = `sha256:${'a'.repeat(64)}` as const;
    return runSprintRecoveryOperation(root, 'sprint-913', {
      dryRun, skipAudit: true,
      approval: { identity: readSprintRecoverySettlementIdentity(root, 'sprint-913'),
        approvalRef: 'approval:test-recovery', idempotencyKey: 'test-recovery-once' },
      exactCustodyInspection: () => ({ state: 'ready', unresolved: [], recoveryListReceiptDigest: fixtureReceiptDigest }),
      exactCustodyRecovery: () => ({ sprintId: 'sprint-913', reconciled: [], recoveryListReceiptDigest: fixtureReceiptDigest }),
    });
  }

  it('keeps the exact sprint-state bytes when housekeeping preserves its checkpoint', async () => {
    const f = fixture();
    const report = await recover(f.root);
    expect(report.artifactPolicy.checkpoint.disposition).toBe('preserved');
    expect(readFileSync(f.checkpointPath, 'utf8')).toBe(f.checkpointBytes);
    expect(existsSync(f.statePath), 'resume requires the state that recovery must retain').toBe(true);
    expect(readFileSync(f.statePath, 'utf8')).toBe(f.stateBytes);
  });

  it('does not alter the checkpoint or sprint-state during a dry-run', async () => {
    const f = fixture();
    await recover(f.root, true);
    expect(readFileSync(f.checkpointPath, 'utf8')).toBe(f.checkpointBytes);
    expect(readFileSync(f.statePath, 'utf8')).toBe(f.stateBytes);
  });

  it('never removes another sprint’s persisted state', async () => {
    const f = fixture('sprint-914');
    await recover(f.root);
    expect(readFileSync(f.statePath, 'utf8')).toBe(f.stateBytes);
  });

  it('keeps the existing housekeeping behavior when no checkpoint remains', async () => {
    const f = fixture();
    rmSync(f.checkpointPath);
    const report = await recover(f.root);
    expect(report.artifactPolicy.checkpoint.disposition).toBe('absent');
    expect(existsSync(f.statePath)).toBe(false);
  });

  it.each([true, false])('retires state only for a generation-bound terminal Flow (bound=%s)', async bound => {
    const f = fixture();
    const sprintId = 'sprint-913';
    const flowId = 'fixture-terminal-flow';
    mkdirSync(join(f.root, '.deckent', 'pids'), { recursive: true });
    mkdirSync(join(f.root, '.deckent', 'runtime', 'jobs'), { recursive: true });
    writeFileSync(join(f.root, '.deckent', 'pids', `${sprintId}.snapshot.json`), JSON.stringify({
      sprintId, pid: 2_996_159, startToken: bound ? 'fixture-generation' : 'foreign-generation',
    }));
    savePlannedSprint(f.root, flowId, { revision: 1, sprint: { id: sprintId } } as never);
    saveRunHandle(f.root, {
      flowId, revision: 1, planDigest: 'fixture-only',
      handle: { flowId, jobId: 'fixture-terminal-job', logRef: 'fixture-terminal-log' },
      startedAt: '2026-09-12T00:00:00.000Z', pid: 2_996_159, startToken: 'fixture-generation',
    } as never);
    writeFileSync(join(f.root, '.deckent', 'runtime', 'jobs', 'fixture-terminal-job.json'), JSON.stringify({
      status: 'FAILED', completionRecord: { flowId }, error: 'fixture failure',
    }));
    await recover(f.root);
    expect(readFileSync(f.checkpointPath, 'utf8')).toBe(f.checkpointBytes);
    expect(existsSync(f.statePath)).toBe(!bound);
  });
});
