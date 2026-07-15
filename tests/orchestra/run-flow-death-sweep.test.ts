// ─── born-698c — detached-run death-sweep pins ───────────────────────────────
// The silent-death class: a detached run whose process died without finalizing
// must receive an HONEST durable RUN_FAILED closure on the next read — and the
// sweep must never guess (alive pids untouched; pid-less legacy records
// reported, not killed).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import { sweepDeadDetachedRuns } from '../../src/orchestra/run-flow-death-sweep.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import { saveRunHandle } from '../../src/core/run-flow-store.js';
import type { RunProposal, PlanPreview } from '../../src/core/run-flow-contract.js';

function proposal(flowId: string): RunProposal {
  return {
    flowId, tenant: 'local', project: 'p', actor: { id: 'u' },
    origin: 'api', revision: 1, intentSummary: 'x',
  };
}

function preview(flowId: string): PlanPreview {
  return {
    flowId, revision: 1, planDigest: 'd-1',
    taskSummaries: [], policyDecision: { decision: 'allow' } as never, gateResult: 'pass' as never,
  };
}

/** Drive a flow to DETACHED_RUNNING with the given recorded pid. */
function detachedFlow(root: string, flowId: string, pid?: number): void {
  const c = getRunFlowCoordinator(root);
  c.proposeFlow({ proposal: proposal(flowId) });
  c.recordPreview({ preview: preview(flowId) });
  c.grantApproval({ flowId, revision: 1, planDigest: 'd-1', approvedBy: { id: 'u' } });
  c.requestStart({ flowId, revision: 1, planDigest: 'd-1' });
  c.recordRunStarted({ handle: { flowId, jobId: `j-${flowId}`, logRef: 'log' } });
  saveRunHandle(root, {
    flowId, revision: 1, planDigest: 'd-1',
    handle: { flowId, jobId: `j-${flowId}`, logRef: 'log' },
    startedAt: new Date().toISOString(),
    ...(pid !== undefined ? { pid } : {}),
  });
}

/** A pid that provably no longer exists: spawn a no-op child and let it exit. */
function deadPid(): number {
  const child = spawnSync(process.execPath, ['-e', 'process.exit(0)'], { encoding: 'utf-8' });
  void child;
  // spawnSync's child already exited; its pid is unavailable — use a probe
  // loop over high pids instead: find one where kill(pid, 0) throws ESRCH.
  for (let pid = 999_999; pid > 990_000; pid--) {
    try {
      process.kill(pid, 0);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ESRCH') return pid;
    }
  }
  throw new Error('no dead pid found in probe range');
}

describe('run-flow death sweep (born-698c)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'death-sweep-'));
    _resetRunFlowCoordinatorsForTests();
  });

  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  it('dead pid → durable RUN_FAILED closure with an honest system narrative', () => {
    detachedFlow(root, 'flow-dead', deadPid());

    const report = sweepDeadDetachedRuns(root);
    expect(report.closed).toHaveLength(1);
    expect(report.closed[0]).toMatchObject({ flowId: 'flow-dead', outcome: 'closed-dead' });

    // durable: a FRESH coordinator (restart) folds to FAILED
    _resetRunFlowCoordinatorsForTests();
    const context = getRunFlowCoordinator(root).getFlow('flow-dead');
    expect(context.state).toBe('FAILED');
  });

  it('alive pid → untouched (never guesses a kill)', () => {
    detachedFlow(root, 'flow-alive', process.pid);
    const report = sweepDeadDetachedRuns(root);
    expect(report.closed).toHaveLength(0);
    expect(report.skipped.find((s) => s.flowId === 'flow-alive')?.outcome).toBe('alive');
    expect(getRunFlowCoordinator(root).getFlow('flow-alive').state).toBe('DETACHED_RUNNING');
  });

  it('pid-less legacy record → reported as unknown-liveness, left untouched', () => {
    detachedFlow(root, 'flow-legacy');
    const report = sweepDeadDetachedRuns(root);
    expect(report.closed).toHaveLength(0);
    expect(report.skipped.find((s) => s.flowId === 'flow-legacy')?.outcome).toBe('no-pid-record');
  });

  it('sweep is idempotent: a second pass over a closed flow does nothing', () => {
    detachedFlow(root, 'flow-once', deadPid());
    sweepDeadDetachedRuns(root);
    const second = sweepDeadDetachedRuns(root);
    expect(second.closed).toHaveLength(0); // FAILED is terminal — not a live state
  });

  it('completed flows are never touched (terminal states out of scope)', () => {
    const c = getRunFlowCoordinator(root);
    detachedFlow(root, 'flow-done', deadPid());
    c.recordCompletion({ flowId: 'flow-done', summary: 'ok' });
    const report = sweepDeadDetachedRuns(root);
    expect(report.closed).toHaveLength(0);
  });
});
