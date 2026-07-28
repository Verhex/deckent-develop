import { describe, expect, it } from 'vitest';

import {
  assertCrossVerifyEnforcedAttemptContract,
  assertCrossVerifyEnforcedAttemptContractV2,
  createCrossVerifyEnforcedAttemptContract,
  createCrossVerifyEnforcedAttemptContractV2,
  sameCrossVerifyExecutionContract,
  type CrossVerifyEnforcedAttemptContractInputV2,
  type CrossVerifyEnforcedAttemptContractInputV1,
  type CrossVerifyEnforcedAttemptContractV1,
} from '../../src/core/cross-verify-execution-contract.js';

function input(
  overrides: Partial<CrossVerifyEnforcedAttemptContractInputV1> = {},
): CrossVerifyEnforcedAttemptContractInputV1 {
  return {
    tenantId: 'tenant-a',
    projectId: 'project-a',
    runId: 'sprint-456',
    taskId: '456-001',
    verifierTaskId: '456-001-xverify',
    callId: 'xverify-call-456-001',
    attemptId: '456-001-xverify-attempt-1',
    fenceTokenHash: '1'.repeat(64),
    operationClass: 'verify-implementation',
    basePromptSha256: '2'.repeat(64),
    dispatchedPromptSha256: '3'.repeat(64),
    taskSnapshotSha256: '4'.repeat(64),
    budget: { maxTokens: 1_000, maxTurns: 3, maxUsd: 0.25 },
    budgetFingerprint: '5'.repeat(64),
    budgetProfileRef: 'execution-budget:xverify-auditor-0001',
    budgetPolicyDigest: '6'.repeat(64),
    landingPolicy: { reserve_ratio: 0.25, attended_unsupported: 'hold' },
    attendanceMode: 'unattended',
    provider: 'codex',
    model: 'gpt-5.5',
    authMode: 'api',
    accountRefHash: '7'.repeat(64),
    transport: 'http',
    executionBackend: 'docker',
    endpointRefHash: '8'.repeat(64),
    executionProfileRef: 'execution-profile:codex-xverify-0001',
    providerLimitEstimates: [
      { windowId: 'tokens-all', unit: 'tokens', amount: 1_000 },
      { windowId: 'billing-usd', unit: 'usd', amount: 0.25 },
    ],
    timeoutMs: 120_000,
    modelEffort: 'low',
    toolProfileDigest: '9'.repeat(64),
    isolatedContext: true,
    settlementAttemptRef: {
      schemaVersion: 1,
      taskId: '456-001-xverify',
      backend: 'docker',
      projectRootSha256: 'a'.repeat(64),
      attemptId: '456-001-xverify-attempt-1',
    },
    ...overrides,
  };
}

function inputV2(
  overrides: Partial<CrossVerifyEnforcedAttemptContractInputV2> = {},
): CrossVerifyEnforcedAttemptContractInputV2 {
  return {
    ...input({ operationClass: 'adjudicate-claim' }),
    adjudication: {
      protocol: 'xverify-adjudication-v2',
      claimDigest: `sha256:${'b'.repeat(64)}`,
      evidenceManifestDigest: `sha256:${'c'.repeat(64)}`,
      adjudicationContractDigest: `sha256:${'d'.repeat(64)}`,
      evidenceBrokerRef: `cross-verify-evidence-manifest:sha256:${'e'.repeat(64)}`,
      evidenceBrokerManifestSha256: 'e'.repeat(64),
      evidenceMountPath: '/deckent/xverify-evidence',
      evidenceManifestRelativePath: 'manifest.json',
      runtimeImageRef: `sha256:${'9'.repeat(64)}`,
      finalPromptDigest: `sha256:${'f'.repeat(64)}`,
      finalPromptChars: 8_000,
      maxPromptChars: 16_000,
      maxEvidenceOutputChars: 12_000,
      maxRationaleChars: 2_000,
      evidenceAccess: 'snapshot-read-only',
      artifactMutationPolicy: 'attempt-private-output-only',
    },
    ...overrides,
  };
}

describe('CrossVerifyEnforcedAttemptContractV1', () => {
  it('produces one canonical content-addressed and deeply immutable contract', () => {
    const first = createCrossVerifyEnforcedAttemptContract(input());
    const second = createCrossVerifyEnforcedAttemptContract(input());

    expect(first).toEqual(second);
    expect(first.evidenceRef).toBe(`xverify-contract:${first.contractSha256}`);
    expect(sameCrossVerifyExecutionContract(first, second)).toBe(true);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.budget)).toBe(true);
    expect(Object.isFrozen(first.landingPolicy)).toBe(true);
    expect(Object.isFrozen(first.providerLimitEstimates)).toBe(true);
    expect(Object.isFrozen(first.providerLimitEstimates[0])).toBe(true);
    expect(Object.isFrozen(first.settlementAttemptRef)).toBe(true);
    assertCrossVerifyEnforcedAttemptContract(first);
  });

  it('changes content evidence without changing the stable attempt identity fields', () => {
    const first = createCrossVerifyEnforcedAttemptContract(input());
    const changed = createCrossVerifyEnforcedAttemptContract(input({
      dispatchedPromptSha256: 'b'.repeat(64),
    }));

    expect(changed.attemptId).toBe(first.attemptId);
    expect(changed.fenceTokenHash).toBe(first.fenceTokenHash);
    expect(changed.contractSha256).not.toBe(first.contractSha256);
    expect(sameCrossVerifyExecutionContract(first, changed)).toBe(false);
  });

  it('rejects integrity substitution and settlement-attempt drift', () => {
    const contract = createCrossVerifyEnforcedAttemptContract(input());
    const substituted = {
      ...contract,
      dispatchedPromptSha256: 'c'.repeat(64),
    } as CrossVerifyEnforcedAttemptContractV1;
    expect(() => assertCrossVerifyEnforcedAttemptContract(substituted))
      .toThrow(/integrity mismatch/i);

    expect(() => createCrossVerifyEnforcedAttemptContract(input({
      settlementAttemptRef: {
        ...input().settlementAttemptRef,
        attemptId: '456-001-xverify-attempt-2',
      },
    }))).toThrow(/settlement attempt/i);
  });

  it('fails loudly on absent budget authority and unsupported backend identity', () => {
    expect(() => createCrossVerifyEnforcedAttemptContract(input({ budget: {} })))
      .toThrow(/explicit auditor budget/i);
    expect(() => createCrossVerifyEnforcedAttemptContract(input({
      executionBackend: 'unknown',
    }))).toThrow(/unsupported xverify execution backend/i);
  });
});

describe('CrossVerifyEnforcedAttemptContractV2', () => {
  it('binds one typed claim, evidence snapshot, finite prompt, and output policy', () => {
    const first = createCrossVerifyEnforcedAttemptContractV2(inputV2());
    const second = createCrossVerifyEnforcedAttemptContractV2(inputV2());

    expect(first).toEqual(second);
    expect(first.schemaVersion).toBe(2);
    expect(first.evidenceRef).toBe(`xverify-contract-v2:${first.contractSha256}`);
    expect(Object.isFrozen(first.adjudication)).toBe(true);
    assertCrossVerifyEnforcedAttemptContractV2(first);
  });

  it('rejects prompt overflow and mutable evidence access', () => {
    expect(() => createCrossVerifyEnforcedAttemptContractV2(inputV2({
      adjudication: {
        ...inputV2().adjudication,
        finalPromptChars: 16_001,
      },
    }))).toThrow(/prompt exceeds/i);

    expect(() => createCrossVerifyEnforcedAttemptContractV2(inputV2({
      adjudication: {
        ...inputV2().adjudication,
        evidenceAccess: 'project-read-write' as 'snapshot-read-only',
      },
    }))).toThrow(/execution policy/i);

    expect(createCrossVerifyEnforcedAttemptContractV2(inputV2({
      operationClass: 'verify-implementation',
    })).operationClass).toBe('verify-implementation');
  });

  it('detects semantic evidence substitution after contract creation', () => {
    const contract = createCrossVerifyEnforcedAttemptContractV2(inputV2());
    const substituted = {
      ...contract,
      adjudication: {
        ...contract.adjudication,
        claimDigest: `sha256:${'0'.repeat(64)}`,
      },
    };

    expect(() => assertCrossVerifyEnforcedAttemptContractV2(substituted))
      .toThrow(/integrity mismatch/i);
  });
});
