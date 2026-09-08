import { describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { GoalInvocationRuntime } from '../../../../src/orchestra/autonomous/mission-store/goal-invocation-runtime.js';
import { GoalInvocationTransportError } from '../../../../src/orchestra/autonomous/goal-invocation-transport.js';
import type { HostRoleInvocationCandidateAuthority } from '../../../../src/core/host-role-invocation-admission-runtime.js';

function harness(existing: unknown = null) {
  const events: unknown[] = [];
  let artifact: { ref: Record<string, unknown>; bytes: Uint8Array; reservationRequest?: unknown; usageEvent?: unknown } | null = null;
  const reservation = {
    tenantId: 'tenant-a', projectId: 'project-a', runId: 'mission-a', taskId: null,
    receiptRef: `invocation-receipt:${'placeholder'}`, estimates: [{ windowId: 'tokens', unit: 'tokens', amount: 10 }],
    fenceTokenHash: 'f'.repeat(64), provider: 'claude', model: 'claude-fable-5',
    authMode: 'subscription', accountRefHash: 'a'.repeat(64), quotaScopeRefHash: 'b'.repeat(64),
    backend: { transport: 'cli', executionBackend: 'host-subprocess', endpointRefHash: null },
    reachabilityEvidenceRef: 'reachability:test', estimateEvidenceRefs: ['estimate:test'],
  };
  const admissionRuntime = {
    admit: vi.fn(() => ({ decision: 'allow', reservation, resolution: { selected: { provider: 'claude', model: 'claude-fable-5', source: 'config' }, decisionReasonCode: 'none' } })),
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
      artifact = { ref: { ...input.ref, contentSha256: 'c'.repeat(64), byteLength: input.bytes.byteLength }, bytes: input.bytes,
        reservationRequest: input.reservationRequest, usageEvent: input.usageEvent };
      events.push(input.transportEvent);
      return artifact.ref;
    }),
    readOutputArtifact: vi.fn(() => artifact),
  };
  return { events, reservation, admissionRuntime, ledger, setArtifact(value: typeof artifact) { artifact = value; } };
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
      },
    };
    const h = harness(existing);
    h.setArtifact({
      ref: {
        schemaVersion: 1, tenantId: 'tenant-a', projectId: 'project-a', invocationId,
        purpose: 'goal-authoring', provider: 'claude', model: 'claude-fable-5',
        promptDigest: 'a'.repeat(64), contentSha256: answerDigest, byteLength: 6,
      },
      bytes: Buffer.from('answer'),
      reservationRequest: {}, usageEvent: {},
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
  });

  it('does not claim semantic consumption until the caller settles it', async () => {
    const h = harness();
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never,
      executeSelected: async () => ({ output: 'answer', provider: 'claude', model: 'claude-fable-5', durationMs: 4,
        usage: { inputTokens: 3, outputTokens: 2, totalTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, source: 'provider-adapter' } }) });
    const input = { tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain' as const,
      purpose: 'goal-authoring' as const, prompt: 'p',
      admission: { invocation: { primaryProvider: 'claude', model: 'claude-fable-5' } } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } };
    const invocationId = `goal-${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex'))}`;
    h.reservation.receiptRef = `invocation-receipt:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex'))}`;
    const pending = await runtime.execute(input);
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
    const h = harness({ transportOutcome: 'succeeded', consumerOutcome: 'unknown' });
    const promptDigest = await import('node:crypto').then(({ createHash }) => createHash('sha256').update('p').digest('hex'));
    const invocationId = `goal-${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex'))}`;
    const receiptRef = `invocation-receipt:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex'))}`;
    h.setArtifact({ ref: { tenantId: 'tenant-a', projectId: 'project-a', purpose: 'goal-authoring', provider: 'claude', model: 'claude-fable-5', promptDigest }, bytes: Buffer.from('answer'),
      reservationRequest: { runId: 'mission-a', taskId: null, callId: 'goal-authoring:1', receiptRef }, usageEvent: {} });
    const executeSelected = vi.fn();
    const candidate: HostRoleInvocationCandidateAuthority = { provider: 'claude', model: 'claude-fable-5',
      reachabilityQuery: {} as never, limitQuery: {} as never };
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
    const h = harness({ transportOutcome: 'succeeded', consumerOutcome: 'unknown' });
    const digest = (value: string) => import('node:crypto').then(({ createHash }) => createHash('sha256').update(value).digest('hex'));
    const invocationId = `goal-${await digest('tenant-a\u0000mission-a\u00001\u0000goal-authoring')}`;
    h.setArtifact({ ref: { tenantId: 'tenant-a', projectId: 'project-a', purpose: 'goal-authoring', provider: 'claude', model: 'shared-model', promptDigest: await digest('p') },
      bytes: Buffer.from('answer'), reservationRequest: { runId: 'mission-a', taskId: null, callId: 'goal-authoring:1',
        receiptRef: `invocation-receipt:${await digest(`tenant-a\u0000project-a\u0000${invocationId}`)}` }, usageEvent: {} });
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never, executeSelected: vi.fn() as never });
    const mismatchedCandidate: HostRoleInvocationCandidateAuthority = { provider: 'codex', model: 'shared-model',
      reachabilityQuery: {} as never, limitQuery: {} as never };
    await expect(runtime.execute({ tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain', purpose: 'goal-authoring', prompt: 'p',
      admission: { candidates: { claude: mismatchedCandidate } } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } }))
      .rejects.toMatchObject({ hold: { reasonCode: 'receipt_unavailable' } });
    expect(h.admissionRuntime.settleExistingDispatch).not.toHaveBeenCalled();
    expect(h.events).toHaveLength(0);
  });

  it.each([
    [false, 'released'],
    [true, null],
  ] as const)('records terminal transport truth and releases only proven pre-dispatch failures (%s)', async (dispatchStarted, expectedSettlement) => {
    const h = harness();
    const runtime = new GoalInvocationRuntime({ admissionRuntime: h.admissionRuntime as never, receiptLedger: h.ledger as never,
      executeSelected: async () => { throw new GoalInvocationTransportError(dispatchStarted ? 'unknown' : 'failed', dispatchStarted ? 'spawn_error' : 'command_build_failed', null, null, 3, dispatchStarted); } });
    const input = { tenantId: 'tenant-a', missionId: 'mission-a', round: 1, role: 'brain' as const, purpose: 'goal-authoring' as const, prompt: 'p',
      admission: { invocation: { primaryProvider: 'claude', model: 'claude-fable-5' } } as never,
      finalOnlyUsage: { maxWallClockSeconds: 30, profileRef: 'execution_budget.final_only_usage', policyDigest: 'd'.repeat(64) } };
    const invocationId = `goal-${await import('node:crypto').then(({ createHash }) => createHash('sha256').update('tenant-a\u0000mission-a\u00001\u0000goal-authoring').digest('hex'))}`;
    h.reservation.receiptRef = `invocation-receipt:${await import('node:crypto').then(({ createHash }) => createHash('sha256').update(`tenant-a\u0000project-a\u0000${invocationId}`).digest('hex'))}`;
    await expect(runtime.execute(input)).rejects.toThrow('GOAL_SELECTED_TRANSPORT_FAILED');
    expect(h.events.at(-1)).toMatchObject({ type: 'transport_settled', payload: { outcome: dispatchStarted ? 'unknown' : 'failed' } });
    expect(h.admissionRuntime.settleDispatch).toHaveBeenCalledTimes(expectedSettlement ? 1 : 0);
    if (expectedSettlement) expect(h.admissionRuntime.settleDispatch.mock.calls[0]?.[1]).toMatchObject({ type: expectedSettlement });
  });
});
