// ─── born-698c — detached-run death-sweep pins ───────────────────────────────
// The silent-death class: a detached run whose process died without finalizing
// must receive an HONEST durable RUN_FAILED closure on the next read — and the
// sweep must never guess (alive pids untouched; pid-less legacy records
// reported, not killed).

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

import {
  summarizeDeathSweepSkipped,
  sweepDeadDetachedRuns,
  sweepLegacyFlowArtifacts,
  sweepStaleRuns,
} from '../../src/orchestra/run-flow-death-sweep.js';
import { getRunFlowCoordinator, _resetRunFlowCoordinatorsForTests } from '../../src/orchestra/run-flow-coordinator-registry.js';
import {
  admitStartAttempt,
  prepareStartAttempt,
  recordStartAttemptProcessSpawned,
  saveApprovedSnapshot,
  saveRunHandle,
} from '../../src/core/run-flow-store.js';
import type { RunProposal, PlanPreview } from '../../src/core/run-flow-contract.js';
import { processStartToken } from '../../src/core/pid-ownership.js';

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
    expect(report.skipped.find((s) => s.flowId === 'flow-legacy')?.outcome)
      .toBe('run-handle-ownership-unknown');
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

  it('summarizes 100 skipped entries by class with at most three examples', () => {
    const skipped = Array.from({ length: 100 }, (_, index) => ({
      flowId: `legacy-${index.toString().padStart(3, '0')}`,
      outcome: index < 60 ? 'no-pid-record' as const : 'alive' as const,
      detail: `fixture ${index}`,
    }));

    const summary = summarizeDeathSweepSkipped(skipped);

    expect(summary.total).toBe(100);
    expect(summary.classes).toEqual([
      expect.objectContaining({ outcome: 'alive', count: 40 }),
      expect.objectContaining({ outcome: 'no-pid-record', count: 60 }),
    ]);
    expect(summary.classes.every((entry) => entry.examples.length <= 3)).toBe(true);
    expect(summary.classes.reduce((total, entry) => total + entry.count, 0)).toBe(100);
  });

  it('repairs ADMITTED+handle → RUN_STARTED after a crash between canonical commits', () => {
    const flowId = 'flow-admission-gap';
    const c = getRunFlowCoordinator(root);
    c.proposeFlow({ proposal: proposal(flowId) });
    c.recordPreview({ preview: preview(flowId) });
    c.grantApproval({ flowId, revision: 1, planDigest: 'd-1', approvedBy: { id: 'u' } });
    c.requestStart({ flowId, revision: 1, planDigest: 'd-1' });
    const token = processStartToken(process.pid);
    const processIdentity = token === null
      ? { pid: process.pid, startToken: null, evidence: 'unavailable' as const }
      : { pid: process.pid, startToken: token, evidence: 'verified' as const };
    const prepared = prepareStartAttempt(root, {
      flowId,
      revision: 1,
      planDigest: 'd-1',
      attemptId: 'attempt-admission-gap',
      preparedAt: '2026-07-28T10:00:00.000Z',
      lineage: {
        tenantId: 'local',
        projectId: 'p',
        actor: { id: 'u' },
        origin: 'api',
        correlationId: 'correlation-admission-gap',
        idempotencyKey: 'idempotency-admission-gap',
        parentPlanLineageHash: 'a'.repeat(64),
        parentCorrelationId: 'plan-admission-gap',
        authorizationAuthority: 'approved-actor:u',
      },
      owner: {
        process: processIdentity,
        ownerNonce: 'nonce-admission-gap',
        leaseUntil: '2099-07-28T10:01:00.000Z',
      },
    }).attempt;
    const cas = {
      flowId,
      revision: 1,
      planDigest: 'd-1',
      generation: prepared.generation,
      attemptId: prepared.attemptId,
      ownerNonce: prepared.owner.ownerNonce,
    };
    recordStartAttemptProcessSpawned(root, {
      ...cas,
      process: processIdentity,
      spawnedAt: '2026-07-28T10:00:10.000Z',
    });
    admitStartAttempt(root, {
      ...cas,
      process: processIdentity,
      handle: { flowId, jobId: 'job-admission-gap', logRef: 'log-admission-gap' },
      admittedAt: '2026-07-28T10:00:20.000Z',
    });

    expect(c.getFlow(flowId).state).toBe('STARTING');
    const report = sweepDeadDetachedRuns(root);
    expect(report.skipped).toContainEqual(expect.objectContaining({
      flowId,
      outcome: 'reconciled-admitted',
    }));
    expect(c.getFlow(flowId).state).toBe('DETACHED_RUNNING');
  });
});

// ─── F-3 — operator stale-run sweep (`deckent runs --close-stale`) ───────────

describe('sweepStaleRuns — operator stale-run sweep (F-3)', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'stale-sweep-'));
    _resetRunFlowCoordinatorsForTests();
  });

  afterEach(() => {
    _resetRunFlowCoordinatorsForTests();
    rmSync(root, { recursive: true, force: true });
  });

  function preparedOnlyFlow(flowId: string, pid: number, startToken: string | null): void {
    const c = getRunFlowCoordinator(root);
    c.proposeFlow({ proposal: proposal(flowId) });
    c.recordPreview({ preview: preview(flowId) });
    c.grantApproval({ flowId, revision: 1, planDigest: 'd-1', approvedBy: { id: 'u' } });
    c.requestStart({ flowId, revision: 1, planDigest: 'd-1' });
    prepareStartAttempt(root, {
      flowId,
      revision: 1,
      planDigest: 'd-1',
      attemptId: `attempt-${flowId}`,
      preparedAt: '2026-08-25T10:00:00.000Z',
      lineage: {
        tenantId: 'local',
        projectId: 'p',
        actor: { id: 'u' },
        origin: 'api',
        correlationId: `correlation-${flowId}`,
        idempotencyKey: `idempotency-${flowId}`,
        parentPlanLineageHash: 'a'.repeat(64),
        parentCorrelationId: `plan-${flowId}`,
        authorizationAuthority: 'approved-actor:u',
      },
      owner: {
        process: {
          pid,
          startToken,
          evidence: startToken === null ? 'unavailable' : 'verified',
        },
        ownerNonce: `nonce-${flowId}`,
        leaseUntil: '2099-08-25T10:01:00.000Z',
      },
    });
  }

  it('dry-run classifies dead + unverifiable + alive WITHOUT writing any closure', () => {
    detachedFlow(root, 'flow-dead', deadPid());
    detachedFlow(root, 'flow-legacy');
    detachedFlow(root, 'flow-alive', process.pid);

    const report = sweepStaleRuns(root, { apply: false });
    expect(report.applied).toBe(false);
    expect(report.dead.map((e) => e.flowId)).toEqual(['flow-dead']);
    expect(report.unverifiable.map((e) => e.flowId)).toEqual(['flow-legacy']);
    expect(report.skipped.find((s) => s.flowId === 'flow-alive')?.outcome).toBe('alive');

    // zero writes: a fresh coordinator still sees both live-claiming states
    _resetRunFlowCoordinatorsForTests();
    const c = getRunFlowCoordinator(root);
    expect(c.getFlow('flow-dead').state).toBe('DETACHED_RUNNING');
    expect(c.getFlow('flow-legacy').state).toBe('DETACHED_RUNNING');
  });

  it('inventories 100 handleless/logless artifacts, then archives only with explicit approval', () => {
    for (let index = 0; index < 100; index += 1) {
      const flowId = `legacy-artifact-${index.toString().padStart(3, '0')}`;
      saveApprovedSnapshot(root, {
        flowId,
        revision: 1,
        planDigest: 'd-1',
        approvedBy: { id: 'u' },
        approvedAt: '2026-08-25T00:00:00.000Z',
        sprint: { id: flowId, tasks: [] } as never,
      });
    }
    detachedFlow(root, 'hermetic-handle', process.pid);

    const dryRun = sweepLegacyFlowArtifacts(root, { apply: false });
    expect(dryRun.candidates).toHaveLength(100);
    expect(dryRun.candidates.every((entry) => entry.archivedFiles.length === 0)).toBe(true);
    expect(existsSync(dryRun.candidates[0]!.sourceFiles[0]!)).toBe(true);

    const applied = sweepLegacyFlowArtifacts(root, { apply: true });
    expect(applied.candidates).toHaveLength(100);
    expect(applied.candidates.every((entry) => entry.archivedFiles.length === 1)).toBe(true);
    expect(applied.candidates.every((entry) => !existsSync(entry.sourceFiles[0]!))).toBe(true);
    const manifestPath = applied.candidates[0]!.manifestPath!;
    expect(JSON.parse(readFileSync(manifestPath, 'utf8'))).toMatchObject({
      schemaVersion: 1,
      classification: 'handleless-logless-legacy-flow-artifact',
    });
    expect(getRunFlowCoordinator(root).getFlow('hermetic-handle').state).toBe('DETACHED_RUNNING');
  });

  it('projects legacy artifact inventory through the existing stale-runs report seam', () => {
    saveApprovedSnapshot(root, {
      flowId: 'legacy-visible', revision: 1, planDigest: 'd-1',
      approvedBy: { id: 'u' }, approvedAt: '2026-08-25T00:00:00.000Z',
      sprint: { id: 'legacy-visible', tasks: [] } as never,
    });

    const report = sweepStaleRuns(root, { apply: false });

    expect(report.legacyArtifacts.candidates).toHaveLength(1);
    expect(report.unverifiable).toContainEqual(expect.objectContaining({
      flowId: 'legacy-visible',
      classification: 'handleless-logless-legacy-flow-artifact',
      closedAs: 'archived',
    }));
  });

  it('apply closes a dead pid as FAILED and an unverifiable record as CANCELLED — durably', () => {
    detachedFlow(root, 'flow-dead', deadPid());
    detachedFlow(root, 'flow-legacy');
    detachedFlow(root, 'flow-alive', process.pid);

    const report = sweepStaleRuns(root, { apply: true });
    expect(report.applied).toBe(true);
    expect(report.dead).toEqual([expect.objectContaining({ flowId: 'flow-dead', closedAs: 'failed' })]);
    expect(report.unverifiable.map((e) => e.flowId)).toEqual(['flow-legacy']);

    _resetRunFlowCoordinatorsForTests();
    const c = getRunFlowCoordinator(root);
    expect(c.getFlow('flow-dead').state).toBe('FAILED');
    expect(c.getFlow('flow-legacy').state).toBe('CANCELLED');
    expect(c.getFlow('flow-alive').state).toBe('DETACHED_RUNNING'); // never guesses a kill
  });

  it('apply closes a PREPARED-only dead start attempt as CANCELLED — durably', () => {
    preparedOnlyFlow('flow-prepared-dead', deadPid(), 'dead-start-token');

    const report = sweepStaleRuns(root, { apply: true });

    expect(report.unverifiable).toEqual([
      expect.objectContaining({
        flowId: 'flow-prepared-dead',
        classification: 'stale-start-attempt',
        closedAs: 'cancelled',
      }),
    ]);
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('flow-prepared-dead').state).toBe('CANCELLED');
  });

  it('a PREPARED-only live start attempt is typed and never closed', () => {
    const token = processStartToken(process.pid);
    if (token === null) throw new Error('test host did not expose the current process start token');
    preparedOnlyFlow('flow-prepared-live', process.pid, token);

    const report = sweepStaleRuns(root, { apply: true });

    expect(report.unverifiable).toHaveLength(0);
    expect(report.skipped).toContainEqual(expect.objectContaining({
      flowId: 'flow-prepared-live',
      outcome: 'start-attempt-alive',
    }));
    expect(getRunFlowCoordinator(root).getFlow('flow-prepared-live').state).toBe('STARTING');
  });

  it('a jobs-terminal flow is NEVER closed — its execution truth already won (skip, not a lie)', () => {
    detachedFlow(root, 'flow-finished', deadPid());
    const report = sweepStaleRuns(root, {
      apply: true,
      jobsTerminalFlowIds: new Set(['flow-finished']),
    });
    expect(report.dead).toHaveLength(0);
    expect(report.skipped.find((s) => s.flowId === 'flow-finished')?.outcome).toBe('jobs-terminal');
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('flow-finished').state).toBe('DETACHED_RUNNING');
  });

  it('a dead pid on a LEGACY record (no event fold) closes as CANCELLED, not a fold-crashing FAILED', () => {
    // Simulate a post-698 do-origin flow: snapshot + handle WITH pid, but an
    // empty event log (the in-memory controller never writes events.jsonl).
    const startedAt = '2026-07-15T09:00:00.000Z';
    saveApprovedSnapshot(root, {
      flowId: 'legacy-dead-do', revision: 1, planDigest: 'd-1',
      approvedBy: { id: 'u' }, approvedAt: startedAt,
      sprint: { id: 'legacy-dead-do', tasks: [] } as never,
    });
    saveRunHandle(root, {
      flowId: 'legacy-dead-do', revision: 1, planDigest: 'd-1',
      handle: { flowId: 'legacy-dead-do', jobId: 'j-ldd', logRef: 'log' },
      startedAt, pid: deadPid(),
    });
    _resetRunFlowCoordinatorsForTests();

    const report = sweepStaleRuns(root, { apply: true });
    expect(report.dead).toHaveLength(1);
    expect(report.dead[0]).toMatchObject({ flowId: 'legacy-dead-do', closedAs: 'cancelled' });

    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('legacy-dead-do').state).toBe('CANCELLED');
  });

  it('a LEGACY dual-read flow (snapshot+handle only, no events.jsonl) closes as CANCELLED', () => {
    // Simulate a real pre-698 `deckent do` flow: another process wrote the two
    // legacy stores directly — no proposeFlow, no event log, no pid.
    const startedAt = '2026-07-14T11:16:15.483Z';
    saveApprovedSnapshot(root, {
      flowId: 'legacy-do-flow', revision: 1, planDigest: 'd-1',
      approvedBy: { id: 'u' }, approvedAt: startedAt,
      sprint: { id: 'legacy-do-flow', tasks: [] } as never,
    });
    saveRunHandle(root, {
      flowId: 'legacy-do-flow', revision: 1, planDigest: 'd-1',
      handle: { flowId: 'legacy-do-flow', jobId: 'j-legacy', logRef: 'log' },
      startedAt,
    });
    _resetRunFlowCoordinatorsForTests();

    const report = sweepStaleRuns(root, { apply: true });
    expect(report.unverifiable.map((e) => e.flowId)).toEqual(['legacy-do-flow']);

    // durable: the abort event log now outranks the legacy dual-read
    _resetRunFlowCoordinatorsForTests();
    expect(getRunFlowCoordinator(root).getFlow('legacy-do-flow').state).toBe('CANCELLED');
  });

  it('is idempotent and composes with the read-path sweep (shared dead-run closure command)', () => {
    detachedFlow(root, 'flow-dead', deadPid());
    detachedFlow(root, 'flow-legacy');

    sweepStaleRuns(root, { apply: true });
    // second operator pass: both flows are terminal now — nothing to close
    const second = sweepStaleRuns(root, { apply: true });
    expect(second.dead).toHaveLength(0);
    expect(second.unverifiable).toHaveLength(0);
    // the read-path sweep after the operator sweep also finds nothing live
    const readPath = sweepDeadDetachedRuns(root);
    expect(readPath.closed).toHaveLength(0);
  });
});
