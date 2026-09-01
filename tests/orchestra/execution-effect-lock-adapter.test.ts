import { afterEach, describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { checkProjectMaintenanceLock } from '../../src/core/file-lock.js';
import {
  createExecutionEffectLandingLeaseResumeContextV1,
  type ExecutionEffectLandingBoundaryV1,
  type ExecutionEffectLandingLeaseJournalRefV1,
  type ExecutionEffectLandingLeaseV1,
  type ExecutionEffectLandingTransactionRefV1,
} from '../../src/core/execution-effect-persistence-contract.js';
import { createExecutionEffectLockAdapterV1 } from '../../src/orchestra/execution-effect-lock-adapter.js';

const ROOT_IDENTITY = `sha256:${'1'.repeat(64)}`;
const TRANSACTION = `sha256:${'2'.repeat(64)}`;
const PREPARED = `sha256:${'3'.repeat(64)}`;
const COMMITTED = `sha256:${'4'.repeat(64)}`;
const APPLYING = `sha256:${'5'.repeat(64)}`;

function compareCodePoint(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => compareCodePoint(left, right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function digest(domain: string, value: unknown): `sha256:${string}` {
  return `sha256:${createHash('sha256')
    .update(domain, 'utf8')
    .update('\0', 'utf8')
    .update(canonicalJson(value), 'utf8')
    .digest('hex')}`;
}

function transaction(): ExecutionEffectLandingTransactionRefV1 {
  const body = Object.freeze({
    version: 1 as const,
    projectId: 'project-1',
    taskId: 'task-1',
    attemptId: '018f0000-0000-7000-8000-000000000001',
    generation: 1,
    attemptDigest: digest('test-attempt', 'attempt'),
    baselineManifestDigest: digest('test-baseline', 'baseline'),
    finalManifestDigest: digest('test-final', 'final'),
    containmentDecisionDigest: digest('test-decision', 'decision'),
    planId: 'plan-1',
    planDigest: digest('test-plan', 'plan'),
  });
  return Object.freeze({
    ...body,
    transactionDigest: digest('execution-effect-landing-transaction-v1', body),
  });
}

function journalRef(
  tx: ExecutionEffectLandingTransactionRefV1,
  phase: ExecutionEffectLandingLeaseJournalRefV1['phase'],
  recordDigest: `sha256:${string}`,
): ExecutionEffectLandingLeaseJournalRefV1 {
  return Object.freeze({
    phase,
    artifactKey: `effect-landing/${tx.transactionDigest.slice(7)}/${phase.toLowerCase()}.json`,
    artifactReceiptDigest: digest('test-artifact-receipt', phase),
    contentDigest: digest('test-artifact-content', phase),
    byteLength: 128,
    recordDigest,
  });
}

function resumeContext(
  lease: ExecutionEffectLandingLeaseV1,
  boundary: ExecutionEffectLandingBoundaryV1 | null,
) {
  const tx = transaction();
  if (lease.transactionDigest !== tx.transactionDigest) throw new Error('test transaction drift');
  return createExecutionEffectLandingLeaseResumeContextV1({
    transaction: tx,
    priorLease: lease,
    prepared: journalRef(tx, 'PREPARED', PREPARED),
    applying: boundary === null ? null : Object.freeze({
      journal: journalRef(tx, 'APPLYING', APPLYING),
      previousBoundary: boundary,
    }),
    committed: null,
  });
}

describe('execution effect lock adapter', () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  });

  function root(): string {
    const value = mkdtempSync(join(tmpdir(), 'deckent-effect-lock-adapter-'));
    roots.push(value);
    return value;
  }

  function adapter(projectRoot: string) {
    let now = Date.now();
    return createExecutionEffectLockAdapterV1(projectRoot, {
      projectRootIdentityDigest: ROOT_IDENTITY,
      lockOptions: { now: () => ++now },
    });
  }

  function restartAdapter(
    projectRoot: string,
    now: number,
    suffix: string,
    liveness: 'alive' | 'dead' | 'unknown' | 'foreign-host' = 'dead',
  ) {
    const runtimeIdentity = {
      hostInstanceId: `effect-lock-host-${suffix}`,
      bootSessionId: `effect-lock-boot-${suffix}`,
      processSessionId: `effect-lock-process-${suffix}`,
    };
    return createExecutionEffectLockAdapterV1(projectRoot, {
      projectRootIdentityDigest: ROOT_IDENTITY,
      lockOptions: {
        now: () => now,
        leaseDurationMs: 100,
        ownerPid: process.pid + 1000 + suffix.charCodeAt(0),
        runtimeIdentity,
        livenessProbe: {
          inspect: lock => lock.hostInstanceId === runtimeIdentity.hostInstanceId
            && lock.bootSessionId === runtimeIdentity.bootSessionId
            && lock.processSessionId === runtimeIdentity.processSessionId
            ? 'alive' : liveness,
        },
      },
    });
  }

  it('binds a changed transaction to one maintenance fence and durable terminal audit', () => {
    const projectRoot = root();
    const lockAdapter = adapter(projectRoot);
    const acquired = lockAdapter.acquire(TRANSACTION);
    lockAdapter.assert(acquired);
    const renewed = lockAdapter.renew(acquired);
    expect(renewed.fencingTokenDigest).toBe(acquired.fencingTokenDigest);
    const boundary = lockAdapter.beginBoundary(renewed, PREPARED);
    const terminal = lockAdapter.completeBoundary(renewed, boundary, COMMITTED);
    expect(terminal).toMatchObject({
      transactionDigest: TRANSACTION,
      terminal: 'COMPLETED',
      committedJournalDigest: COMMITTED,
    });
    expect(lockAdapter.readTerminal(TRANSACTION, COMMITTED)).toEqual(terminal);
    expect(lockAdapter.readTerminal(
      TRANSACTION,
      `sha256:${'5'.repeat(64)}`,
    )).toBeNull();
    expect(checkProjectMaintenanceLock(projectRoot)).toEqual({ state: 'absent' });
  });

  it('settles a no-change transaction through a durable terminal contract', () => {
    const projectRoot = root();
    const lockAdapter = adapter(projectRoot);
    const lease = lockAdapter.acquire(TRANSACTION);
    const terminal = lockAdapter.releaseNoChange(lease, COMMITTED);
    expect(terminal.terminal).toBe('RELEASED_NO_CHANGE');
    expect(lockAdapter.readTerminal(TRANSACTION, COMMITTED)).toEqual(terminal);
    expect(checkProjectMaintenanceLock(projectRoot)).toEqual({ state: 'absent' });
  });

  it('rejects a forged or stale lease object', () => {
    const projectRoot = root();
    const lockAdapter = adapter(projectRoot);
    const lease = lockAdapter.acquire(TRANSACTION);
    expect(() => lockAdapter.assert({
      ...lease,
      leaseReceiptDigest: `sha256:${'f'.repeat(64)}`,
    })).toThrow(/lease authority is unavailable/iu);
    const renewed = lockAdapter.renew(lease);
    expect(() => lockAdapter.assert(lease)).toThrow(/lease authority is unavailable/iu);
    const boundary = lockAdapter.beginBoundary(renewed, PREPARED);
    const terminal = lockAdapter.completeBoundary(renewed, boundary, COMMITTED);
    expect(terminal.terminal).toBe('COMPLETED');
  });

  it('adopts an exact dead active lease across repeated process restarts', () => {
    const projectRoot = root();
    const base = Date.parse('2026-09-01T10:00:00.000Z');
    const tx = transaction();
    const first = restartAdapter(projectRoot, base, 'a');
    const originalLease = first.acquire(tx.transactionDigest);
    const context = resumeContext(originalLease, null);

    const second = restartAdapter(projectRoot, base + 101, 'b');
    const firstAdoption = second.resume(context);
    expect(firstAdoption).toMatchObject({
      state: 'ADOPTED',
      currentBoundary: null,
      resumeReceipt: { priorLeaseReceiptDigest: originalLease.leaseReceiptDigest },
    });
    expect(firstAdoption.lease.fencingTokenDigest)
      .not.toBe(originalLease.fencingTokenDigest);

    const third = restartAdapter(projectRoot, base + 202, 'c');
    const secondAdoption = third.resume(context);
    expect(secondAdoption.lease.fencingTokenDigest)
      .not.toBe(firstAdoption.lease.fencingTokenDigest);
    expect(secondAdoption.resumeReceipt.durableEvidenceDigests).toHaveLength(2);
    const terminal = third.releaseNoChange(secondAdoption.lease, COMMITTED);
    expect(terminal.terminal).toBe('RELEASED_NO_CHANGE');
    expect(third.readTerminal(tx.transactionDigest, COMMITTED)).toEqual(terminal);
  });

  it('rebinds an immutable applying boundary to the fresh dead-owner fence', () => {
    const projectRoot = root();
    const base = Date.parse('2026-09-01T11:00:00.000Z');
    const tx = transaction();
    const first = restartAdapter(projectRoot, base, 'd');
    const originalLease = first.acquire(tx.transactionDigest);
    const originalBoundary = first.beginBoundary(originalLease, PREPARED);
    const context = resumeContext(originalLease, originalBoundary);

    const second = restartAdapter(projectRoot, base + 101, 'e');
    const adopted = second.resume(context);
    expect(adopted.currentBoundary).not.toBeNull();
    expect(adopted.currentBoundary?.boundaryId).toBe(originalBoundary.boundaryId);
    expect(adopted.currentBoundary?.fencingTokenDigest)
      .toBe(adopted.lease.fencingTokenDigest);
    expect(adopted.currentBoundary?.fencingTokenDigest)
      .not.toBe(originalBoundary.fencingTokenDigest);
    const terminal = second.completeBoundary(
      adopted.lease,
      adopted.currentBoundary!,
      COMMITTED,
    );
    expect(terminal.terminal).toBe('COMPLETED');
  });

  it.each(['alive', 'unknown', 'foreign-host'] as const)(
    'keeps active lease restart fail-closed when owner liveness is %s',
    liveness => {
      const projectRoot = root();
      const base = Date.parse('2026-09-01T12:00:00.000Z');
      const tx = transaction();
      const first = restartAdapter(projectRoot, base, 'f');
      const lease = first.acquire(tx.transactionDigest);
      const context = resumeContext(lease, null);
      const contender = restartAdapter(projectRoot, base + 101, 'g', liveness);
      expect(() => contender.resume(context)).toThrow(/owner is|cannot be resumed|still held/iu);
      expect(checkProjectMaintenanceLock(projectRoot).state).toBe('held');
    },
  );
});
