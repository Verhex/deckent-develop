import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GoalInvocationRuntime } from '../../../../src/orchestra/autonomous/mission-store/goal-invocation-runtime.js';
import { GoalInvocationTransportError } from '../../../../src/orchestra/autonomous/goal-invocation-transport.js';
import type { HostRoleInvocationCandidateAuthority } from '../../../../src/core/host-role-invocation-admission-runtime.js';
import { InvocationReceiptStore } from '../../../../src/core/invocation-receipt-store.js';
import { deriveProviderQuotaScopeRefHash } from '../../../../src/core/provider-limit-truth.js';

const HOST_BACKEND = Object.freeze({
  transport: 'cli' as const,
  executionBackend: 'host-subprocess' as const,
  endpointRefHash: null,
});
const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function executableTransport<T>(implementation: (...args: never[]) => T) {
  return Object.assign(vi.fn(implementation), { preflight: vi.fn() });
}

function harness(existing: unknown = null) {
  const events: unknown[] = [];
  let artifact: { ref: Record<string, unknown>; bytes: Uint8Array; reservationRequest?: unknown; usageEvent?: unknown } | null = null;
  const reservation = {
    tenantId: 'tenant-a', projectId: 'project-a', runId: 'mission-a', taskId: null,
    receiptRef: `invocation-receipt:${'placeholder'}`, estimates: [{ windowId: 'tokens', unit: 'tokens', amount: 10 }],
    fenceTokenHash: 'f'.repeat(64), provider: 'claude', model: 'claude-fable-5',
    authMode: 'subscription', accountRefHash: 'a'.repeat(64), quotaScopeRefHash: 'b'.repeat(64),
    backend: { ...HOST_BACKEND },
    reachabilityEvidenceRef: 'reachability:test', estimateEvidenceRefs: ['estimate:test'],
  };
  const admissionRuntime = {
    admit: vi.fn((request: { buildReservation(selected: { provider: 'claude'; model: string; source: 'config' }): typeof reservation }) => {
      const selected = { provider: 'claude' as const, model: 'claude-fable-5', source: 'config' as const };
      try {
        const built = request.buildReservation(selected);
        return { decision: 'allow' as const, reservation: built, resolution: { selected, decisionReasonCode: 'none' } };
      } catch {
        return { decision: 'hold' as const, reservation: null, resolution: { selected: null, decisionReasonCode: 'validation_failed' } };
      }
    }),
    claimDispatch: vi.fn(() => ({ claimed: true, executionGrant: { dispatchEventRef: 'dispatch:test' } })),
    settleDispatch: vi.fn((_admission, event) => event),
    settleExistingDispatch: vi.fn((_request, event) => event),
  };
  const ledger = {
    projectId: 'project-a', get: vi.fn(() => existing), close() {},
    declare: vi.fn(receipt => ({ ref: { schemaVersion: 1, tenantId: receipt.tenantId, projectId: receipt.projectId, invocationId: receipt.invocationId }, created: true })),
    append: vi.fn((_scope, _id, event) => {
      events.push(event);
      return { ...event, sequence: events.length, occurredAt: '2026-09-08T00:00:00.000Z',
        previousHash: null, hash: 'e'.repeat(64) };
    }),
    writeOutputArtifact: vi.fn(input => {
      artifact = {
        admissionMode: 'reserved' as const,
        ref: { ...input.ref, contentSha256: 'c'.repeat(64), byteLength: input.bytes.byteLength },
        bytes: input.bytes,
        reservationRequest: input.reservationRequest,
        usageEvent: input.usageEvent,
      };
      events.push(input.transportEvent);
      return artifact.ref;
    }),
    readOutputArtifact: vi.fn(() => artifact),
  };
  return { events, reservation, admissionRuntime, ledger, setArtifact(value: typeof artifact) { artifact = value; } };
}

function freshAdmission(h: ReturnType<typeof harness>, extra: Record<string, unknown> = {}) {
  return { ...extra, buildReservation: () => h.reservation };
}

describe('GoalInvocationRuntime', () => {
  it('settles only a persisted checkpoint bound to the exact successful output artifact', () => {
    const invocationId = 'goal-persisted-consumer';
    const answerDigest = createHash('sha256').update('answer').digest('hex');
    const existing = {
      transportOutcome: 'succeeded',
      consumerOutcome: 'unknown',
      receipt: {
        invocationId, tenantId: 'tenant-a', projectId: 'project-a', runId: 'mission-a', taskId: null,
        callId: 'goal-authoring:1', purpose: 'goal-authoring', role: 'brain',
        called: { provider: 'claude', model: 'claude-fable-5' },
        backend: { ...HOST_BACKEND },
      },
    };
    const h = harness(existing);
    h.setArtifact({
      admissionMode: 'reserved' as const,
      ref: {
        schemaVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', invocationId,
        purpose: 'goal-authoring', provider: 'claude', model: 'claude-fable-5',
        promptDigest: 'a'.repeat(64), contentSha256: answerDigest, byteLength: 6,
      },
      bytes: Buffer.from('answer'),
      reservationRequest: { provider: 'claude', model: 'claude-fable-5', backend: { ...HOST_BACKEND } },
      usageEvent: {},
    });
    const runtime = new GoalInvocationRuntime({
      admissionRuntime: h.admissionRuntime as never,
      receiptLedger: h.ledger as never,
      executeSelected: vi.fn() as never,
    });
    const checkpoint = {
      schemaVersion: 1 as const,
      checkpointId: 'goal-consumer-checkpoint',
      tenantId: 'tenant-a', projectId: 'project-a', missionId: 'mission-a', round: 1,
      purpose: 'goal-authoring' as const,
      invocationReceiptRef: { schemaVersion: 1 as const, tenantId: 'tenant-a', projectId: 'project-a', invocationId },
      outputDigest: answerDigest, effectDigest: 'd'.repeat(64),
      effect: { kind: 'authored-batch' as const, items: [] },
      createdAt: '2026-09-08T00:00:00.000Z', acknowledged: false,
    };
    expect(runtime.settlePersistedConsumer(checkpoint)).toEqual({
      schemaVersion: 1,
      invocationReceiptRef: checkpoint.invocationReceiptRef,
      receiptEventId: `${invocationId}-consumer`,
      receiptEventHash: 'e'.repeat(64),
    });
    expect(h.events.at(-1)).toEqual({
      eventId: `${invocationId}-consumer`,
      type: 'consumer_settled',
      payload: { outcome: 'accepted', reasonCode: 'none' },
    });
    expect(() => runtime.settlePersistedConsumer({ ...checkpoint, outputDigest: 'f'.repeat(64) }))
      .toThrow('GOAL_INVOCATION_CHECKPOINT_RECEIPT_MISMATCH');
    h.setArtifact({
      admissionMode: 'reserved' as const,
      ref: {
        schemaVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', invocationId,
        purpose: 'goal-authoring', provider: 'claude', model: 'claude-fable-5',
        promptDigest: 'a'.repeat(64), contentSha256: answerDigest, byteLength: 6,
      },
      bytes: Buffer.from('answer'),
      reservationRequest: {
        provider: 'claude', model: 'claude-fable-5',
        backend: { ...HOST_BACKEND, executionBackend: 'docker' },
      },
      usageEvent: {},
    });
    expect(() => runtime.settlePersistedConsumer(checkpoint))
      .toThrow('GOAL_INVOCATION_CHECKPOINT_RECEIPT_MISMATCH');
  });

  it('does not claim semantic consumption until the caller settles it', async () => {
    const h = harness();
    const executeSelected = executableTransport(async () => ({
      output: 'answer', provider: 'claude', model: 'claude-fable-5', backend: { ...HOST_BACKEND }, durationMs: 4,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, source: 'provider-adapter' as const },
    }));
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never,
      executeSelected });
    const input = { tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain' as const,
      purpose: 'goal-authoring' as const, prompt: 'p',
      admission: freshAdmission(h, { invocation: { primaryProvider: 'claude', model: 'claude-fable-5' } }) as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } };
    const invocationId = `goal-${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex'))}`;
    h.reservation.receiptRef = `invocation-receipt:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex'))}`;
    const pending = await runtime.execute(input);
    expect(executeSelected.preflight).toHaveBeenCalledWith({ backend: HOST_BACKEND });
    expect(executeSelected).toHaveBeenCalledWith(expect.objectContaining({ backend: HOST_BACKEND }));
    expect(h.events).toHaveLength(2);
    pending.settleConsumer('accepted');
    expect(h.events).toHaveLength(3);
    expect(h.events.at(-1)).toMatchObject({ type: 'consumer_settled', payload: { outcome: 'accepted' } });
  });

  it('does not admit or dispatch a deterministic replay', async () => {
    const h = harness({ consumerOutcome: 'accepted' });
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never, executeSelected: vi.fn() as never });
    await expect(runtime.execute({ tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain', purpose: 'goal-authoring', prompt: 'p', admission: {} as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } }))
      .rejects.toThrow('GOAL_INVOCATION_ALREADY_CONSUMED');
    expect(h.admissionRuntime.admit).not.toHaveBeenCalled();
  });

  it('resumes a succeeded unsettled consumer from bound output without another provider call', async () => {
    const h = harness({ transportOutcome: 'succeeded', consumerOutcome: 'unknown', receipt: {
      backend: { ...HOST_BACKEND }, called: { provider: 'claude', model: 'claude-fable-5' },
    } });
    const promptDigest = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('p').digest('hex'));
    const invocationId = `goal-${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex'))}`;
    const receiptRef = `invocation-receipt:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex'))}`;
    h.setArtifact({ admissionMode: 'reserved' as const, ref: { tenantId: 'tenant-a', projectId: 'project-a', purpose: 'goal-authoring', provider: 'claude', model: 'claude-fable-5', promptDigest }, bytes: Buffer.from('answer'),
      reservationRequest: { runId: 'mission-a', taskId: null, callId: 'goal-authoring:1', receiptRef,
        provider: 'claude', model: 'claude-fable-5', backend: { ...HOST_BACKEND } }, usageEvent: {} });
    const executeSelected = vi.fn();
    const candidate: HostRoleInvocationCandidateAuthority = { provider: 'claude', model: 'claude-fable-5',
      reachabilityQuery: { ...HOST_BACKEND } as never, limitQuery: {} as never };
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never, executeSelected });
    const pending = await runtime.execute({ tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain', purpose: 'goal-authoring', prompt: 'p',
      admission: { candidates: { claude: candidate } } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } });
    expect(pending.output).toBe('answer');
    expect(executeSelected).not.toHaveBeenCalled();
    pending.settleConsumer('accepted');
    expect(h.events.at(-1)).toMatchObject({ type: 'consumer_settled' });
  });

  it('holds a replay when the candidate map key masks a different provider identity', async () => {
    const h = harness({ transportOutcome: 'succeeded', consumerOutcome: 'unknown', receipt: {
      backend: { ...HOST_BACKEND }, called: { provider: 'claude', model: 'shared-model' },
    } });
    const digest = (value: string) => import('node:crypto').then(({ createHash }) => createHash('sha256').update(value).digest('hex'));
    const invocationId = `goal-${await digest('tenant-a\u0000mission-a\u00001\u0000goal-authoring')}`;
    h.setArtifact({ admissionMode: 'reserved' as const, ref: { tenantId: 'tenant-a', projectId: 'project-a', purpose: 'goal-authoring', provider: 'claude', model: 'shared-model', promptDigest: await digest('p') },
      bytes: Buffer.from('answer'), reservationRequest: { runId: 'mission-a', taskId: null, callId: 'goal-authoring:1',
        receiptRef: `invocation-receipt:${await digest(`tenant-a\u0000project-a\u0000${invocationId}`)}`,
        provider: 'claude', model: 'shared-model', backend: { ...HOST_BACKEND } }, usageEvent: {} });
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never, executeSelected: vi.fn() as never });
    const mismatchedCandidate: HostRoleInvocationCandidateAuthority = { provider: 'codex', model: 'shared-model',
      reachabilityQuery: { ...HOST_BACKEND } as never, limitQuery: {} as never };
    await expect(runtime.execute({ tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain', purpose: 'goal-authoring', prompt: 'p',
      admission: { candidates: { claude: mismatchedCandidate } } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } }))
      .rejects.toMatchObject({ hold: { reasonCode: 'receipt_unavailable' } });
    expect(h.admissionRuntime.settleExistingDispatch).not.toHaveBeenCalled();
    expect(h.events).toHaveLength(0);
  });

  it('holds replay when the artifact reservation backend differs from the candidate and receipt', async () => {
    const existing = {
      transportOutcome: 'succeeded', consumerOutcome: 'unknown',
      receipt: { backend: { ...HOST_BACKEND }, called: { provider: 'claude', model: 'claude-fable-5' } },
    };
    const h = harness(existing);
    const invocationId = `goal-${createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex')}`;
    const receiptRef = `invocation-receipt:${createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex')}`;
    h.setArtifact({
      admissionMode: 'reserved' as const,
      ref: {
        tenantId: 'tenant-a', projectId: 'project-a', purpose: 'goal-authoring',
        provider: 'claude', model: 'claude-fable-5', promptDigest: createHash('sha256').update('p').digest('hex'),
      },
      bytes: Buffer.from('answer'),
      reservationRequest: {
        runId: 'mission-a', taskId: null, callId: 'goal-authoring:1', receiptRef,
        provider: 'claude', model: 'claude-fable-5',
        backend: { ...HOST_BACKEND, executionBackend: 'docker' },
      },
      usageEvent: {},
    });
    const candidate: HostRoleInvocationCandidateAuthority = {
      provider: 'claude', model: 'claude-fable-5',
      reachabilityQuery: { ...HOST_BACKEND } as never, limitQuery: {} as never,
    };
    const runtime = new GoalInvocationRuntime({
      admissionRuntime: h.admissionRuntime as never,
      receiptLedger: h.ledger as never,
      executeSelected: vi.fn() as never,
    });
    await expect(runtime.execute({
      tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain',
      purpose: 'goal-authoring', prompt: 'p', admission: { candidates: { claude: candidate } } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) },
    })).rejects.toMatchObject({ hold: { reasonCode: 'receipt_unavailable' } });
    expect(h.admissionRuntime.settleExistingDispatch).not.toHaveBeenCalled();
    expect(h.events).toHaveLength(0);
  });

  it.each([
    [false, 'released'],
    [true, null],
  ] as const)('records terminal transport truth and releases only proven pre-dispatch failures (%s)', async (dispatchStarted, expectedSettlement) => {
    const h = harness();
    const executeSelected = executableTransport(async () => {
      throw new GoalInvocationTransportError(dispatchStarted ? 'unknown' : 'failed', dispatchStarted ? 'spawn_error' : 'command_build_failed', null, null, 3, dispatchStarted);
    });
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never,
      executeSelected });
    const input = { tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain' as const, purpose: 'goal-authoring' as const, prompt: 'p',
      admission: freshAdmission(h, { invocation: { primaryProvider: 'claude', model: 'claude-fable-5' } }) as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } };
    const invocationId = `goal-${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex'))}`;
    h.reservation.receiptRef = `invocation-receipt:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex'))}`;
    await expect(runtime.execute(input)).rejects.toThrow('GOAL_SELECTED_TRANSPORT_FAILED');
    expect(h.events.at(-1)).toMatchObject({ type: 'transport_settled', payload: { outcome: dispatchStarted ? 'unknown' : 'failed' } });
    expect(h.admissionRuntime.settleDispatch).toHaveBeenCalledTimes(expectedSettlement ? 1 : 0);
    if (expectedSettlement) expect(h.admissionRuntime.settleDispatch.mock.calls[0]?.[1]).toMatchObject({ type: expectedSettlement });
  });

  it('holds an executor without explicit backend capability before claim or dispatch', async () => {
    const h = harness();
    const executeSelected = vi.fn();
    const runtime = new GoalInvocationRuntime({
      admissionRuntime: h.admissionRuntime as never,
      receiptLedger: h.ledger as never,
      executeSelected: executeSelected as never,
      now: () => new Date('2026-09-08T00:00:00.000Z'),
    });
    const invocationId = `goal-${createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex')}`;
    h.reservation.receiptRef = `invocation-receipt:${createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex')}`;
    await expect(runtime.execute({
      tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain',
      purpose: 'goal-authoring', prompt: 'p', admission: freshAdmission(h) as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) },
    })).rejects.toMatchObject({ hold: { reasonCode: 'reservation_not_executable' } });
    expect(h.admissionRuntime.claimDispatch).not.toHaveBeenCalled();
    expect(executeSelected).not.toHaveBeenCalled();
    expect(h.events).toEqual([]);
    expect(h.ledger.declare).not.toHaveBeenCalled();
    expect(h.admissionRuntime.settleDispatch).not.toHaveBeenCalled();
  });

  it('retries the same identity after a pre-reservation capability HOLD without a poisoned receipt', async () => {
    const root = mkdtempSync(join(tmpdir(), 'goal-backend-retry-'));
    tempRoots.push(root);
    const ledger = new InvocationReceiptStore(root, { idFactory: () => 'project-a' });
    const backend = {
      transport: 'cli' as const,
      executionBackend: 'docker' as const,
      endpointRefHash: 'd'.repeat(64),
    };
    const quotaIdentity = {
      tenantId: 'tenant-a', provider: 'claude', accountRefHash: 'a'.repeat(64),
      authMode: 'subscription' as const, backend,
    };
    const invocationId = `goal-${createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex')}`;
    const receiptAuthorityRef = `invocation-receipt:${createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex')}`;
    const reservation = {
      ...quotaIdentity,
      projectId: 'project-a', model: 'claude-fable-5',
      quotaScopeRefHash: deriveProviderQuotaScopeRefHash(quotaIdentity),
      reservationId: `reservation-${invocationId}`, idempotencyKey: invocationId,
      runId: 'mission-a', taskId: null, callId: 'goal-authoring:1', attemptId: 'attempt-1',
      fenceTokenHash: 'f'.repeat(64), receiptRef: receiptAuthorityRef,
      reachabilityEvidenceRef: 'provider-reachability:test-output',
      estimates: [{ windowId: 'tokens', unit: 'tokens' as const, amount: 10 }],
      estimateEvidenceRefs: ['budget-estimate:test-output'],
      requestedAt: '2026-09-08T00:00:00.000Z', leaseExpiresAt: '2026-09-08T01:00:00.000Z',
    };
    const reservations: typeof reservation[] = [];
    const admissionRuntime = {
      admit: vi.fn((request: { buildReservation(selected: { provider: 'claude'; model: string; source: 'config' }): typeof reservation }) => {
        const selected = { provider: 'claude' as const, model: 'claude-fable-5', source: 'config' as const };
        try {
          const built = request.buildReservation(selected);
          reservations.push(built);
          return { decision: 'allow' as const, reservation: built, resolution: {
            selected,
            configured: { ...selected, reasonCode: 'none' as const },
            decisionReasonCode: 'none',
          } };
        } catch {
          return { decision: 'hold' as const, reservation: null, resolution: {
            selected: null,
            configured: { ...selected, reasonCode: 'none' as const },
            decisionReasonCode: 'validation_failed',
          } };
        }
      }),
      claimDispatch: vi.fn(() => ({ claimed: true, executionGrant: { dispatchEventRef: 'dispatch:test' } })),
      settleDispatch: vi.fn((_admission, event) => event),
      settleExistingDispatch: vi.fn((_request, event) => event),
    };
    let capabilityAvailable = false;
    const executeSelected = Object.assign(vi.fn(async () => ({
      output: '[]', provider: 'claude', model: 'claude-fable-5', backend, durationMs: 1,
      usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2, cacheReadTokens: 0, cacheCreationTokens: 0, source: 'provider-adapter' as const },
    })), {
      preflight: vi.fn(() => {
        if (!capabilityAvailable) throw new Error('DOCKER_CAPABILITY_UNAVAILABLE');
      }),
    });
    const runtime = new GoalInvocationRuntime({
      admissionRuntime: admissionRuntime as never,
      receiptLedger: ledger,
      executeSelected,
      now: () => new Date('2026-09-08T00:00:00.000Z'),
    });
    const input = {
      tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain' as const,
      purpose: 'goal-authoring' as const, prompt: 'p',
      admission: { buildReservation: () => reservation } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) },
    };
    await expect(runtime.execute(input)).rejects.toMatchObject({
      hold: { reasonCode: 'reservation_not_executable', invocationReceiptRef: null },
    });
    expect(ledger.get({ tenantId: 'tenant-a', projectId: 'project-a' }, invocationId)).toBeNull();
    expect(reservations).toEqual([]);
    expect(admissionRuntime.claimDispatch).not.toHaveBeenCalled();
    expect(executeSelected).not.toHaveBeenCalled();

    capabilityAvailable = true;
    await expect(runtime.execute(input)).resolves.toMatchObject({ output: '[]' });
    expect(reservations).toHaveLength(1);
    expect(admissionRuntime.claimDispatch).toHaveBeenCalledTimes(1);
    expect(executeSelected).toHaveBeenCalledTimes(1);
    expect(ledger.get({ tenantId: 'tenant-a', projectId: 'project-a' }, invocationId))
      .toMatchObject({ transportOutcome: 'succeeded', consumerOutcome: 'unknown' });
    ledger.close();
  });

  it.each([
    ['provider', { provider: 'codex', model: 'claude-fable-5', backend: HOST_BACKEND }],
    ['model', { provider: 'claude', model: 'other-model', backend: HOST_BACKEND }],
    ['missing backend', { provider: 'claude', model: 'claude-fable-5', backend: undefined as never }],
    ['execution backend', { provider: 'claude', model: 'claude-fable-5', backend: { ...HOST_BACKEND, executionBackend: 'docker' as const } }],
    ['endpoint', { provider: 'claude', model: 'claude-fable-5', backend: { ...HOST_BACKEND, endpointRefHash: 'a'.repeat(64) } }],
  ])('rejects a successful transport result with mismatched %s before artifact persistence', async (_label, identity) => {
    const h = harness();
    const executeSelected = executableTransport(async () => ({
      output: 'answer', durationMs: 4, ...identity,
      usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, source: 'provider-adapter' as const },
    }));
    const runtime = new GoalInvocationRuntime({
      admissionRuntime: h.admissionRuntime as never,
      receiptLedger: h.ledger as never,
      executeSelected,
    });
    const invocationId = `goal-${createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex')}`;
    h.reservation.receiptRef = `invocation-receipt:${createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex')}`;
    await expect(runtime.execute({
      tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain', purpose: 'goal-authoring', prompt: 'p',
      admission: freshAdmission(h) as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) },
    })).rejects.toThrow('GOAL_SELECTED_TRANSPORT_IDENTITY_MISMATCH');
    expect(h.ledger.writeOutputArtifact).not.toHaveBeenCalled();
    expect(h.events.at(-1)).toMatchObject({
      type: 'transport_settled', payload: { outcome: 'failed', reasonCode: 'validation_failed' },
    });
    expect(h.admissionRuntime.settleDispatch).not.toHaveBeenCalled();
  });
});
