import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ExecutionAdmissionError,
  ExecutionAdmissionStore,
  type ExecutionAdmissionInput,
} from '../../src/core/execution-admission.js';

function fixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), 'deckent-admission-project-'));
  const storeDir = mkdtempSync(join(tmpdir(), 'deckent-admission-host-'));
  mkdirSync(join(projectRoot, '.tasks'));
  const store = new ExecutionAdmissionStore(projectRoot, {
    storeDir,
    now: () => '2026-07-21T12:00:00.000Z',
  });
  return { projectRoot, storeDir, store };
}

function allowInput(overrides: Partial<ExecutionAdmissionInput> = {}): ExecutionAdmissionInput {
  return {
    tenantId: 'tenant-1',
    runId: 'run-1',
    taskId: 'task-1',
    callId: 'call-1',
    attemptId: 'attempt-1',
    role: 'worker',
    taskKind: 'code-development',
    mode: 'unattended',
    configured: { provider: 'claude', model: 'claude-sonnet-5' },
    requested: { provider: 'claude', model: 'claude-sonnet-5' },
    resolved: { provider: 'claude', model: 'claude-sonnet-5' },
    authMode: 'subscription',
    configuredBackend: 'docker',
    resolvedBackend: 'docker',
    fallbackChain: [{
      sequence: 1,
      provider: 'claude',
      model: 'claude-sonnet-5',
      accepted: true,
      reasonCode: 'none',
      reachabilityEvidenceRef: 'reachability:claude-sonnet-5',
      limitEvidenceRefs: ['limits:claude-account'],
    }],
    reachability: { state: 'known', evidenceRefs: ['reachability:claude-sonnet-5'] },
    limits: { state: 'known', evidenceRefs: ['limits:claude-account'] },
    receiptRef: 'invocation:receipt-1',
    approvalEvidenceRef: null,
    budgetProfileRef: 'execution_budget.roles.worker.by_task_kind.code-development',
    budgetPolicyDigest: 'a'.repeat(64),
    budget: { maxTurns: 40, maxCacheReadTokens: 5_000_000 },
    decision: 'allow',
    reasonCode: 'none',
    ...overrides,
  };
}

describe('ExecutionAdmissionStore', () => {
  it('publishes an allow manifest before returning an immutable permit', () => {
    const { projectRoot, storeDir, store } = fixture();
    const declaration = store.declare(allowInput());
    expect(declaration.created).toBe(true);
    expect(declaration.permit).not.toBeNull();
    expect(Object.isFrozen(declaration.permit)).toBe(true);
    expect(readFileSync(
      join(storeDir, `${declaration.manifest.admissionId}.manifest.json`),
      'utf-8',
    )).toContain(declaration.manifest.manifestDigest);
    expect(storeDir.startsWith(projectRoot)).toBe(false);
  });

  it('is idempotent for the same identity/payload and conflicts on mutation', () => {
    const { store } = fixture();
    const first = store.declare(allowInput({ createdAt: '2026-07-21T12:00:00.000Z' }));
    const replay = store.declare(allowInput({ createdAt: '2026-07-21T12:05:00.000Z' }));
    expect(replay.created).toBe(false);
    expect(replay.manifest).toEqual(first.manifest);

    expect(() => store.declare(allowInput({
      budget: { maxTurns: 40, maxCacheReadTokens: 6_000_000 },
    }))).toThrowError(ExecutionAdmissionError);
    expect(() => store.declare(allowInput({
      budget: { maxTurns: 40, maxCacheReadTokens: 6_000_000 },
    }))).toThrow('different immutable payload');
  });

  it('stores HOLD durably without minting an execution permit', () => {
    const { store } = fixture();
    const declaration = store.declare(allowInput({
      decision: 'hold',
      reasonCode: 'limits_unknown',
      limits: { state: 'unknown', evidenceRefs: [] },
      receiptRef: null,
      budgetProfileRef: null,
      budgetPolicyDigest: null,
      budget: null,
      fallbackChain: [{
        sequence: 1,
        provider: 'claude',
        model: 'claude-sonnet-5',
        accepted: false,
        reasonCode: 'limits_unknown',
        reachabilityEvidenceRef: 'reachability:claude-sonnet-5',
        limitEvidenceRefs: [],
      }],
    }));
    expect(declaration.manifest.decision).toBe('hold');
    expect(declaration.permit).toBeNull();
    expect(store.read(`execution-admission:${declaration.manifest.admissionId}`).reasonCode)
      .toBe('limits_unknown');
  });

  it('allows attended unknown-limit work only with explicit approval evidence', () => {
    const { store } = fixture();
    expect(() => store.declare(allowInput({
      mode: 'unattended',
      limits: { state: 'unknown', evidenceRefs: [] },
    }))).toThrow('unattended allow requires known limit evidence');
    expect(() => store.declare(allowInput({
      mode: 'attended',
      limits: { state: 'unknown', evidenceRefs: [] },
      approvalEvidenceRef: null,
    }))).toThrow('attended allow requires approvalEvidenceRef');

    const attended = store.declare(allowInput({
      mode: 'attended',
      limits: { state: 'unknown', evidenceRefs: [] },
      approvalEvidenceRef: 'approval:owner-bounded-run',
    }));
    expect(attended.permit).not.toBeNull();
    expect(() => store.declare(allowInput({
      attemptId: 'attempt-stale',
      mode: 'attended',
      limits: { state: 'stale', evidenceRefs: ['limits:old'] },
      approvalEvidenceRef: 'approval:owner-bounded-run',
    }))).toThrow('only known or explicitly approved unknown');
    expect(() => store.declare(allowInput({
      attemptId: 'attempt-unavailable',
      mode: 'attended',
      limits: { state: 'unavailable', evidenceRefs: [] },
      approvalEvidenceRef: 'approval:owner-bounded-run',
    }))).toThrow('only known or explicitly approved unknown');
  });

  it('rejects USD-only, receipt-less, or reachability-unknown allow manifests', () => {
    const { store } = fixture();
    expect(() => store.declare(allowInput({ budget: { maxUsd: 5 } })))
      .toThrow('measured token/cache/context/turn ceilings');
    expect(() => store.declare(allowInput({ receiptRef: null })))
      .toThrow('requires receiptRef');
    expect(() => store.declare(allowInput({
      reachability: { state: 'unknown', evidenceRefs: [] },
    }))).toThrow('known reachability evidence');
  });

  it('verifies exact dispatch identity and ignores worker task projection mutation', () => {
    const { projectRoot, store } = fixture();
    const declaration = store.declare(allowInput());
    const permit = declaration.permit!;
    writeFileSync(
      join(projectRoot, '.tasks', 'task-task-1.json'),
      JSON.stringify({ id: 'task-1', budget: { maxTurns: 10_000_000 } }),
    );
    expect(store.verify(permit, {
      taskId: 'task-1',
      provider: 'claude',
      model: 'claude-sonnet-5',
      backend: 'docker',
      budget: { maxTurns: 40, maxCacheReadTokens: 5_000_000 },
      receiptRef: 'invocation:receipt-1',
      budgetPolicyDigest: 'a'.repeat(64),
    }).budget).toEqual({ maxTurns: 40, maxCacheReadTokens: 5_000_000 });
    expect(() => store.verify(permit, { budget: { maxTurns: 41 } }))
      .toThrow('exact dispatch matching');
  });

  it('detects manifest corruption and permit tampering', () => {
    const { storeDir, store } = fixture();
    const declaration = store.declare(allowInput());
    const permit = declaration.permit!;
    expect(() => store.verify({ ...permit, taskId: 'other' }))
      .toThrow('does not match the durable manifest');

    const path = join(storeDir, `${declaration.manifest.admissionId}.manifest.json`);
    const raw = readFileSync(path, 'utf-8').replace('claude-sonnet-5', 'claude-opus-4-8');
    writeFileSync(path, raw);
    expect(() => store.verify(permit)).toThrow('failed integrity validation');
  });

  it('grants dispatch exactly once and returns the durable winner on replay', () => {
    const { store } = fixture();
    const permit = store.declare(allowInput()).permit!;
    const first = store.claimDispatch(permit, {
      executorId: 'docker-host-1',
      dispatchEvidenceRef: 'dispatch:event-1',
    });
    const replay = store.claimDispatch(permit, {
      executorId: 'docker-host-2',
      dispatchEvidenceRef: 'dispatch:event-2',
    });
    expect(first.granted).toBe(true);
    expect(replay.granted).toBe(false);
    expect(replay.claim).toEqual(first.claim);
  });
});
