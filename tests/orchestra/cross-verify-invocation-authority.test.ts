import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import type {
  HostRoleVerifierCandidateProjection,
} from '../../src/core/host-role-invocation-admission-runtime.js';
import type { VerifierEligibilityCandidate } from '../../src/core/cross-verify.js';
import { InvocationReceiptStore } from '../../src/core/invocation-receipt-store.js';
import {
  projectCrossVerifyInvocation,
} from '../../src/orchestra/cross-verify-invocation-authority.js';

const roots: string[] = [];
const stores: InvocationReceiptStore[] = [];
const CREATED_AT = '2026-07-25T01:00:00.000Z';

function root(): string {
  const value = mkdtempSync(join(tmpdir(), 'deckent-xverify-authority-'));
  roots.push(value);
  return value;
}

function candidate(
  overrides: Partial<VerifierEligibilityCandidate> = {},
): VerifierEligibilityCandidate {
  return {
    provider: 'codex',
    model: 'gpt-5.5',
    auth: { mode: 'api', accountRefHash: 'a'.repeat(64) },
    backend: {
      transport: 'http',
      executionBackend: 'docker',
      endpointRefHash: 'b'.repeat(64),
      executionProfileRef: 'execution-profile:codex-docker-0001',
    },
    reachability: {
      state: 'known',
      reachable: true,
      evidenceRef: 'provider-reachability:codex-docker-0001',
    },
    limits: {
      state: 'known',
      limited: false,
      evidenceRefs: ['provider-limit:codex-docker-0001'],
    },
    ...overrides,
  };
}

function projection(
  exactCandidate = candidate(),
): Extract<HostRoleVerifierCandidateProjection, { state: 'ready' }> {
  return {
    state: 'ready',
    candidate: exactCandidate,
    authority: {
      provider: exactCandidate.provider,
      model: exactCandidate.model,
      reachabilityQuery: {
        tenantId: 'tenant-a',
        projectId: 'project-xverify-authority',
        provider: exactCandidate.provider,
        model: exactCandidate.model,
        authMode: exactCandidate.auth.mode,
        accountRefHash: exactCandidate.auth.accountRefHash,
        transport: exactCandidate.backend.transport,
        executionBackend: exactCandidate.backend.executionBackend,
        endpointRefHash: exactCandidate.backend.endpointRefHash,
        runtimeFingerprint: 'c'.repeat(64),
        executionProfileRef: exactCandidate.backend.executionProfileRef,
        capability: 'inference',
      },
      limitQuery: {
        tenantId: 'tenant-a',
        provider: exactCandidate.provider,
        accountRefHash: exactCandidate.auth.accountRefHash,
        quotaScopeRefHash: 'd'.repeat(64),
        authMode: exactCandidate.auth.mode,
      },
    },
    authorityEvidenceRef: 'host-role-admission:codex-docker-0001',
  };
}

function harness() {
  const store = new InvocationReceiptStore(root(), {
    idFactory: () => 'project-xverify-authority',
  });
  stores.push(store);
  return {
    store,
    input: {
      projection: projection(),
      ledger: store,
      tenantId: 'tenant-a',
      projectId: store.projectId,
      runId: 'sprint-456',
      taskId: '456-001',
      attempt: 2,
      attemptId: '456-001-xverify-attempt-2',
      fenceTokenHash: 'f'.repeat(64),
      createdAt: CREATED_AT,
    } as const,
  };
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close();
  for (const value of roots.splice(0)) rmSync(value, { recursive: true, force: true });
});

describe('projectCrossVerifyInvocation', () => {
  it('builds one deterministic exact candidate and immutable receipt projection', () => {
    const { store, input } = harness();

    const first = projectCrossVerifyInvocation(input);
    const second = projectCrossVerifyInvocation(input);

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      state: 'ready',
      verifierCandidates: [{
        provider: 'codex',
        model: 'gpt-5.5',
        auth: { mode: 'api', accountRefHash: 'a'.repeat(64) },
        backend: { transport: 'http', executionBackend: 'docker' },
      }],
      invocationReceipt: {
        attempt: 2,
        receipt: {
          tenantId: 'tenant-a',
          projectId: store.projectId,
          runId: 'sprint-456',
          taskId: '456-001-xverify',
          role: 'auditor',
          purpose: 'audit-evaluation',
          configured: { provider: 'codex', model: 'gpt-5.5', source: 'config' },
          requested: { provider: 'codex', model: 'gpt-5.5', source: 'directive' },
          resolved: { provider: 'codex', model: 'gpt-5.5', source: 'router' },
          called: { provider: 'codex', model: 'gpt-5.5', source: 'wire' },
          auth: { mode: 'api', accountRefHash: 'a'.repeat(64) },
          backend: { transport: 'http', executionBackend: 'docker' },
          fallbackChain: [],
          reachability: {
            state: 'known',
            evidenceRef: 'provider-reachability:codex-docker-0001',
          },
          limits: {
            state: 'known',
            evidenceRefs: ['provider-limit:codex-docker-0001'],
          },
          createdAt: CREATED_AT,
        },
      },
    });
    if (first.state !== 'ready') return;
    expect(first.identity.receiptRef).toMatch(/^invocation-receipt:[a-f0-9]{64}$/u);
    expect(first.binding).toEqual({
      attemptId: '456-001-xverify-attempt-2',
      fenceTokenHash: 'f'.repeat(64),
    });
    expect(first.state === 'ready'
      && first.invocationReceipt.ledger.get(
        { tenantId: 'tenant-a', projectId: store.projectId },
        first.invocationReceipt.receipt.invocationId,
      )).toBeNull();
  });

  it('changes deterministic identity across attempts without declaring either receipt', () => {
    const { input } = harness();
    const first = projectCrossVerifyInvocation(input);
    const second = projectCrossVerifyInvocation({ ...input, attempt: 3 });
    expect(first.state).toBe('ready');
    expect(second.state).toBe('ready');
    if (first.state !== 'ready' || second.state !== 'ready') return;
    expect(first.invocationReceipt.receipt.invocationId)
      .not.toBe(second.invocationReceipt.receipt.invocationId);
  });

  it('changes deterministic identity across durable attempt and fence bindings', () => {
    const { input } = harness();
    const first = projectCrossVerifyInvocation(input);
    const changedAttempt = projectCrossVerifyInvocation({
      ...input,
      attemptId: '456-001-xverify-attempt-3',
    });
    const changedFence = projectCrossVerifyInvocation({
      ...input,
      fenceTokenHash: 'e'.repeat(64),
    });
    expect(first.state).toBe('ready');
    expect(changedAttempt.state).toBe('ready');
    expect(changedFence.state).toBe('ready');
    if (first.state !== 'ready'
      || changedAttempt.state !== 'ready'
      || changedFence.state !== 'ready') return;
    expect(changedAttempt.identity.invocationId).not.toBe(first.identity.invocationId);
    expect(changedFence.identity.invocationId).not.toBe(first.identity.invocationId);
  });

  it('keeps one attempt identity stable when evidence changes so declaration detects drift', () => {
    const { input } = harness();
    const first = projectCrossVerifyInvocation(input);
    const changed = projectCrossVerifyInvocation({
      ...input,
      projection: projection(candidate({
        reachability: {
          state: 'known',
          reachable: true,
          evidenceRef: 'provider-reachability:codex-docker-0002',
        },
      })),
    });
    expect(first.state).toBe('ready');
    expect(changed.state).toBe('ready');
    if (first.state !== 'ready' || changed.state !== 'ready') return;
    expect(first.invocationReceipt.receipt.invocationId)
      .toBe(changed.invocationReceipt.receipt.invocationId);
    expect(first.invocationReceipt.receipt.reachability.evidenceRef)
      .not.toBe(changed.invocationReceipt.receipt.reachability.evidenceRef);
    expect(first.invocationReceipt.ledger.declare(first.invocationReceipt.receipt).created)
      .toBe(true);
    expect(() => changed.invocationReceipt.ledger.declare(changed.invocationReceipt.receipt))
      .toThrow(/idempotency key already exists with different immutable content/i);
  });

  it('holds project, scope, canonical-model and evidence mismatches', () => {
    const { input } = harness();
    expect(projectCrossVerifyInvocation({
      ...input,
      projectId: 'project-other',
    })).toMatchObject({ state: 'hold', reasonCode: 'project_identity_mismatch' });
    expect(projectCrossVerifyInvocation({
      ...input,
      attempt: 0,
    })).toMatchObject({ state: 'hold', reasonCode: 'scope_invalid' });
    expect(projectCrossVerifyInvocation({
      ...input,
      projection: projection(candidate({ model: 'gpt-5' })),
    })).toMatchObject({ state: 'hold', reasonCode: 'candidate_identity_invalid' });
    expect(projectCrossVerifyInvocation({
      ...input,
      projection: {
        ...projection(),
        authorityEvidenceRef: 'not-an-opaque-ref',
      },
    })).toMatchObject({ state: 'hold', reasonCode: 'candidate_evidence_invalid' });
  });
});
